import { DocumentDistributionMethod, RecipientRole } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    recipient: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    documentAuditLog: {
      create: vi.fn(),
    },
  },
  getEmailContext: vi.fn(),
  assertOrganisationRatesAndLimits: vi.fn(),
  updateRecipientNextReminder: vi.fn(),
  triggerWebhook: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: mocks.prisma,
}));

vi.mock('../../../server-only/email/get-email-context', () => ({
  getEmailContext: mocks.getEmailContext,
}));

vi.mock('../../../server-only/rate-limit/assert-organisation-rates-and-limits', () => ({
  assertOrganisationRatesAndLimits: mocks.assertOrganisationRatesAndLimits,
}));

vi.mock('../../../server-only/recipient/update-recipient-next-reminder', () => ({
  updateRecipientNextReminder: mocks.updateRecipientNextReminder,
}));

vi.mock('../../../server-only/webhooks/trigger/trigger-webhook', () => ({
  triggerWebhook: mocks.triggerWebhook,
}));

const { run } = await import('./process-signing-reminder.handler');

const createIo = () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
});

describe('process signing reminder job', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.prisma.recipient.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.recipient.update.mockResolvedValue({});
    mocks.getEmailContext.mockResolvedValue({
      emailsDisabled: true,
    });
  });

  it('restores the previous reminder schedule when organisation emails are disabled', async () => {
    const previousLastReminderSentAt = new Date('2026-01-01T00:00:00.000Z');
    const previousNextReminderAt = new Date('2026-01-03T00:00:00.000Z');

    mocks.prisma.recipient.findFirst
      .mockResolvedValueOnce({
        lastReminderSentAt: previousLastReminderSentAt,
        nextReminderAt: previousNextReminderAt,
      })
      .mockResolvedValueOnce({
        id: 10,
        email: 'recipient@example.com',
        name: 'Recipient',
        role: RecipientRole.SIGNER,
        token: 'recipient-token',
        sentAt: new Date('2025-12-30T00:00:00.000Z'),
        envelope: {
          id: 'envelope_test',
          title: 'Test document',
          userId: 1,
          teamId: 2,
          documentMeta: {
            distributionMethod: DocumentDistributionMethod.EMAIL,
            emailSettings: null,
          },
          user: {
            disabled: false,
          },
          recipients: [],
          team: {
            name: 'Test team',
          },
        },
      });

    await run({
      payload: {
        recipientId: 10,
      },
      io: createIo(),
    });

    expect(mocks.prisma.recipient.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          lastReminderSentAt: expect.any(Date),
          nextReminderAt: null,
        },
      }),
    );

    expect(mocks.prisma.recipient.update).toHaveBeenCalledWith({
      where: {
        id: 10,
      },
      data: {
        lastReminderSentAt: previousLastReminderSentAt,
        nextReminderAt: previousNextReminderAt,
      },
    });

    expect(mocks.assertOrganisationRatesAndLimits).not.toHaveBeenCalled();
    expect(mocks.updateRecipientNextReminder).not.toHaveBeenCalled();
    expect(mocks.triggerWebhook).not.toHaveBeenCalled();
  });
});
