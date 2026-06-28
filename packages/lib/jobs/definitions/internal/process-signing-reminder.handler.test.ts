import { DocumentDistributionMethod, DocumentStatus, RecipientRole } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  documentAuditLogCreate: vi.fn(),
  emailTransportSendMail: vi.fn(),
  getEmailContext: vi.fn(),
  recipientFindFirst: vi.fn(),
  recipientUpdateMany: vi.fn(),
  triggerWebhook: vi.fn(),
  updateRecipientNextReminder: vi.fn(),
}));

vi.mock('@documenso/email/templates/document-reminder', () => ({
  default: () => null,
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    documentAuditLog: {
      create: mocks.documentAuditLogCreate,
    },
    recipient: {
      findFirst: mocks.recipientFindFirst,
      updateMany: mocks.recipientUpdateMany,
    },
  },
}));

vi.mock('../../../client-only/providers/i18n-server', () => ({
  getI18nInstance: vi.fn(),
}));

vi.mock('../../../server-only/email/get-email-context', () => ({
  getEmailContext: mocks.getEmailContext,
}));

vi.mock('../../../server-only/rate-limit/assert-organisation-rates-and-limits', () => ({
  assertOrganisationRatesAndLimits: vi.fn(),
}));

vi.mock('../../../server-only/recipient/update-recipient-next-reminder', () => ({
  updateRecipientNextReminder: mocks.updateRecipientNextReminder,
}));

vi.mock('../../../server-only/webhooks/trigger/trigger-webhook', () => ({
  triggerWebhook: mocks.triggerWebhook,
}));

vi.mock('../../../types/document-email', () => ({
  extractDerivedDocumentEmailSettings: () => ({
    recipientSigningRequest: true,
  }),
}));

const createIo = () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
});

describe('process-signing-reminder.handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reschedules claimed reminders when organisation emails are disabled', async () => {
    const now = new Date('2026-06-28T18:00:00.000Z');
    const sentAt = new Date('2026-06-21T18:00:00.000Z');

    vi.useFakeTimers();
    vi.setSystemTime(now);

    mocks.recipientUpdateMany.mockResolvedValue({ count: 1 });
    mocks.recipientFindFirst.mockResolvedValue({
      id: 123,
      name: 'Signer',
      email: 'signer@example.com',
      role: RecipientRole.SIGNER,
      sentAt,
      envelope: {
        id: 'envelope-1',
        title: 'Critical Agreement',
        teamId: 456,
        userId: 789,
        status: DocumentStatus.PENDING,
        documentMeta: {
          distributionMethod: DocumentDistributionMethod.EMAIL,
        },
        user: {
          disabled: false,
        },
        recipients: [],
        team: {
          name: 'Acme',
        },
      },
    });
    mocks.getEmailContext.mockResolvedValue({
      emailsDisabled: true,
      emailTransport: {
        sendMail: mocks.emailTransportSendMail,
      },
    });

    const { run } = await import('./process-signing-reminder.handler');

    await run({
      payload: {
        recipientId: 123,
      },
      io: createIo() as never,
    });

    expect(mocks.recipientUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          lastReminderSentAt: now,
          nextReminderAt: null,
        },
      }),
    );
    expect(mocks.updateRecipientNextReminder).toHaveBeenCalledWith({
      recipientId: 123,
      envelopeId: 'envelope-1',
      sentAt,
      lastReminderSentAt: now,
    });
    expect(mocks.emailTransportSendMail).not.toHaveBeenCalled();
    expect(mocks.documentAuditLogCreate).not.toHaveBeenCalled();
  });

  it('does not reschedule reminders for documents that intentionally disabled email distribution', async () => {
    const now = new Date('2026-06-28T18:00:00.000Z');

    vi.useFakeTimers();
    vi.setSystemTime(now);

    mocks.recipientUpdateMany.mockResolvedValue({ count: 1 });
    mocks.recipientFindFirst.mockResolvedValue({
      id: 123,
      name: 'Signer',
      email: 'signer@example.com',
      role: RecipientRole.SIGNER,
      sentAt: new Date('2026-06-21T18:00:00.000Z'),
      envelope: {
        id: 'envelope-1',
        title: 'Critical Agreement',
        teamId: 456,
        userId: 789,
        status: DocumentStatus.PENDING,
        documentMeta: {
          distributionMethod: DocumentDistributionMethod.NONE,
        },
        user: {
          disabled: false,
        },
        recipients: [],
        team: {
          name: 'Acme',
        },
      },
    });

    const { run } = await import('./process-signing-reminder.handler');

    await run({
      payload: {
        recipientId: 123,
      },
      io: createIo() as never,
    });

    expect(mocks.updateRecipientNextReminder).not.toHaveBeenCalled();
    expect(mocks.getEmailContext).not.toHaveBeenCalled();
  });
});
