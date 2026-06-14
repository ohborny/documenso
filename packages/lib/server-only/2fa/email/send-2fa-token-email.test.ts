import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auditLogCreate: vi.fn(),
  emailTransportSendMail: vi.fn(),
  envelopeFindFirst: vi.fn(),
  generateTwoFactorTokenFromEmail: vi.fn(),
  getEmailContext: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    documentAuditLog: {
      create: mocks.auditLogCreate,
    },
    envelope: {
      findFirst: mocks.envelopeFindFirst,
    },
  },
}));

vi.mock('@documenso/lib/utils/recipients', () => ({
  isRecipientEmailValidForSending: vi.fn(() => true),
}));

vi.mock('@lingui/core/macro', () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((result, string, index) => `${result}${string}${values[index] ?? ''}`, ''),
}));

vi.mock('@prisma/client', () => ({
  EnvelopeType: {
    DOCUMENT: 'DOCUMENT',
  },
}));

vi.mock('../../../client-only/providers/i18n-server', () => ({
  getI18nInstance: vi.fn(),
}));

vi.mock('../../../types/document-audit-logs', () => ({
  DOCUMENT_AUDIT_LOG_TYPE: {
    DOCUMENT_ACCESS_AUTH_2FA_REQUESTED: 'DOCUMENT_ACCESS_AUTH_2FA_REQUESTED',
  },
}));

vi.mock('../../../utils/document-audit-logs', () => ({
  createDocumentAuditLogData: vi.fn((data) => data),
}));

vi.mock('../../email/get-email-context', () => ({
  getEmailContext: mocks.getEmailContext,
}));

vi.mock('./generate-2fa-token-from-email', () => ({
  generateTwoFactorTokenFromEmail: mocks.generateTwoFactorTokenFromEmail,
}));

import { send2FATokenEmail } from './send-2fa-token-email';

describe('send2FATokenEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.envelopeFindFirst.mockResolvedValue({
      id: 'envelope_01',
      title: 'Document',
      teamId: 1,
      documentMeta: null,
      recipients: [
        {
          id: 1,
          email: 'recipient@example.com',
          name: 'Recipient',
        },
      ],
    });

    mocks.getEmailContext.mockResolvedValue({
      branding: {},
      emailLanguage: 'en',
      senderEmail: {
        name: 'Documenso',
        address: 'noreply@example.com',
      },
      replyToEmail: undefined,
      emailsDisabled: true,
      emailTransport: {
        sendMail: mocks.emailTransportSendMail,
      },
    });
  });

  it('does not generate or send a 2FA code when organisation emails are disabled', async () => {
    await send2FATokenEmail({
      token: 'recipient-token',
      envelopeId: 'envelope_01',
    });

    expect(mocks.getEmailContext).toHaveBeenCalledWith({
      emailType: 'RECIPIENT',
      source: {
        type: 'team',
        teamId: 1,
      },
      meta: null,
    });
    expect(mocks.generateTwoFactorTokenFromEmail).not.toHaveBeenCalled();
    expect(mocks.emailTransportSendMail).not.toHaveBeenCalled();
    expect(mocks.auditLogCreate).not.toHaveBeenCalled();
  });
});
