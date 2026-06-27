import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  emailTransport: {
    sendMail: vi.fn(),
  },
  extractDerivedDocumentEmailSettings: vi.fn(),
  getEmailContext: vi.fn(),
  prisma: {
    documentAuditLog: {
      create: vi.fn(),
    },
    recipient: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
  updateRecipientNextReminder: vi.fn(),
}));

vi.mock('@documenso/email/templates/document-reminder', () => ({
  default: () => null,
}));

vi.mock('@documenso/prisma', () => ({
  prisma: mocks.prisma,
}));

vi.mock('@lingui/core/macro', () => ({
  msg: (parts: TemplateStringsArray) => parts[0],
}));

vi.mock('@prisma/client', () => ({
  DocumentDistributionMethod: {
    EMAIL: 'EMAIL',
    NONE: 'NONE',
  },
  DocumentStatus: {
    PENDING: 'PENDING',
  },
  OrganisationType: {
    ORGANISATION: 'ORGANISATION',
  },
  RecipientRole: {
    CC: 'CC',
    SIGNER: 'SIGNER',
  },
  SendStatus: {
    SENT: 'SENT',
  },
  SigningStatus: {
    NOT_SIGNED: 'NOT_SIGNED',
  },
  WebhookTriggerEvents: {
    DOCUMENT_REMINDER_SENT: 'DOCUMENT_REMINDER_SENT',
  },
}));

vi.mock('../../../client-only/providers/i18n-server', () => ({
  getI18nInstance: vi.fn(),
}));

vi.mock('../../../constants/app', () => ({
  NEXT_PUBLIC_WEBAPP_URL: () => 'http://localhost:3000',
}));

vi.mock('../../../constants/recipient-roles', () => ({
  RECIPIENT_ROLES_DESCRIPTION: {
    SIGNER: {
      actionVerb: 'sign',
    },
  },
}));

vi.mock('../../../server-only/email/build-envelope-email-headers', () => ({
  buildEnvelopeEmailHeaders: vi.fn(),
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
  triggerWebhook: vi.fn(),
}));

vi.mock('../../../types/document-audit-logs', () => ({
  DOCUMENT_AUDIT_LOG_TYPE: {
    EMAIL_SENT: 'EMAIL_SENT',
  },
  DOCUMENT_EMAIL_TYPE: {
    REMINDER: 'REMINDER',
  },
}));

vi.mock('../../../types/document-email', () => ({
  extractDerivedDocumentEmailSettings: mocks.extractDerivedDocumentEmailSettings,
}));

vi.mock('../../../types/webhook-payload', () => ({
  mapEnvelopeToWebhookDocumentPayload: vi.fn(),
  ZWebhookDocumentSchema: {
    parse: vi.fn(),
  },
}));

vi.mock('../../../utils/document-audit-logs', () => ({
  createDocumentAuditLogData: vi.fn(),
}));

vi.mock('../../../utils/render-custom-email-template', () => ({
  renderCustomEmailTemplate: vi.fn(),
}));

vi.mock('../../../utils/render-email-with-i18n', () => ({
  renderEmailWithI18N: vi.fn(),
}));

describe('process-signing-reminder handler', () => {
  const now = new Date('2026-06-25T18:00:00.000Z');
  const sentAt = new Date('2026-06-20T18:00:00.000Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();

    mocks.prisma.recipient.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.recipient.findFirst.mockResolvedValue({
      id: 42,
      email: 'recipient@example.com',
      name: 'Recipient',
      role: 'SIGNER',
      sentAt,
      token: 'recipient-token',
      envelope: {
        id: 'envelope-1',
        documentMeta: {
          distributionMethod: 'EMAIL',
        },
        recipients: [],
        team: {
          name: 'Example Team',
        },
        teamId: 7,
        title: 'Example Envelope',
        user: {
          disabled: false,
        },
        userId: 99,
      },
    });
    mocks.extractDerivedDocumentEmailSettings.mockReturnValue({
      recipientSigningRequest: true,
    });
    mocks.getEmailContext.mockResolvedValue({
      branding: {},
      claims: {},
      emailLanguage: 'en',
      emailTransport: mocks.emailTransport,
      emailsDisabled: true,
      organisationId: 'organisation-1',
      organisationType: 'ORGANISATION',
      replyToEmail: undefined,
      senderEmail: {
        address: 'sender@example.com',
        name: 'Sender',
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reschedules the next reminder when organisation emails are disabled after claiming the reminder', async () => {
    const { run } = await import('./process-signing-reminder.handler');

    await run({
      io: {
        logger: {
          info: vi.fn(),
          warn: vi.fn(),
        },
      },
      payload: {
        recipientId: 42,
      },
    });

    expect(mocks.prisma.recipient.updateMany).toHaveBeenCalledWith({
      data: {
        lastReminderSentAt: now,
        nextReminderAt: null,
      },
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        envelope: {
          deletedAt: null,
          status: 'PENDING',
        },
        id: 42,
        role: { not: 'CC' },
        sendStatus: 'SENT',
        signingStatus: 'NOT_SIGNED',
      },
    });
    expect(mocks.updateRecipientNextReminder).toHaveBeenCalledWith({
      envelopeId: 'envelope-1',
      lastReminderSentAt: now,
      recipientId: 42,
      sentAt,
    });
    expect(mocks.emailTransport.sendMail).not.toHaveBeenCalled();
    expect(mocks.prisma.documentAuditLog.create).not.toHaveBeenCalled();
  });
});
