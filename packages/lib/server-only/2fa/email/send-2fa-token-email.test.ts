import { mailer } from '@documenso/email/mailer';
import { DOCUMENSO_INTERNAL_EMAIL } from '@documenso/lib/constants/email';
import { prisma } from '@documenso/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getEmailContext } from '../../email/get-email-context';
import { send2FATokenEmail } from './send-2fa-token-email';

const mocks = vi.hoisted(() => ({
  customTransportSendMail: vi.fn(),
  generateTwoFactorTokenFromEmail: vi.fn(),
  getEmailContext: vi.fn(),
  getI18nInstance: vi.fn(),
  mailerSendMail: vi.fn(),
  prismaDocumentAuditLogCreate: vi.fn(),
  prismaEnvelopeFindFirst: vi.fn(),
  renderEmailWithI18N: vi.fn(),
}));

vi.mock('@documenso/email/mailer', () => ({
  mailer: {
    sendMail: mocks.mailerSendMail,
  },
}));

vi.mock('@documenso/email/templates/access-auth-2fa', () => ({
  AccessAuth2FAEmailTemplate: () => null,
}));

vi.mock('@documenso/lib/utils/recipients', () => ({
  isRecipientEmailValidForSending: vi.fn(() => true),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    documentAuditLog: {
      create: mocks.prismaDocumentAuditLogCreate,
    },
    envelope: {
      findFirst: mocks.prismaEnvelopeFindFirst,
    },
  },
}));

vi.mock('@lingui/core/macro', () => ({
  msg: (strings: TemplateStringsArray) => strings[0],
}));

vi.mock('../../../client-only/providers/i18n-server', () => ({
  getI18nInstance: mocks.getI18nInstance,
}));

vi.mock('../../../constants/app', () => ({
  NEXT_PUBLIC_WEBAPP_URL: () => 'https://app.example.com',
}));

vi.mock('../../../utils/document-audit-logs', () => ({
  createDocumentAuditLogData: vi.fn((data) => data),
}));

vi.mock('../../../utils/envelope', () => ({
  unsafeBuildEnvelopeIdQuery: vi.fn(() => ({ id: 'envelope-1' })),
}));

vi.mock('../../../utils/render-email-with-i18n', () => ({
  renderEmailWithI18N: mocks.renderEmailWithI18N,
}));

vi.mock('../../email/get-email-context', () => ({
  getEmailContext: mocks.getEmailContext,
}));

vi.mock('./generate-2fa-token-from-email', () => ({
  generateTwoFactorTokenFromEmail: mocks.generateTwoFactorTokenFromEmail,
}));

describe('send2FATokenEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.generateTwoFactorTokenFromEmail.mockResolvedValue('123456');
    mocks.getI18nInstance.mockResolvedValue({
      _: (message: string) => message,
    });
    mocks.renderEmailWithI18N.mockResolvedValueOnce('<p>code</p>').mockResolvedValueOnce('code');
    mocks.prismaDocumentAuditLogCreate.mockResolvedValue({});
    mocks.prismaEnvelopeFindFirst.mockResolvedValue({
      id: 'envelope-1',
      teamId: 123,
      title: 'Contract',
      recipients: [
        {
          id: 456,
          email: 'recipient@example.com',
          name: 'Recipient',
          token: 'recipient-token',
        },
      ],
      documentMeta: {
        language: 'en',
      },
    });
    mocks.getEmailContext.mockResolvedValue({
      branding: {},
      emailLanguage: 'en',
      emailTransport: {
        sendMail: mocks.customTransportSendMail,
      },
      senderEmail: {
        name: 'Custom Transport',
        address: 'custom@example.com',
      },
      replyToEmail: 'reply-to@example.com',
    });
  });

  it('sends bearer 2FA codes through the trusted Documenso mailer', async () => {
    await send2FATokenEmail({
      token: 'recipient-token',
      envelopeId: 'envelope-1',
    });

    expect(getEmailContext).toHaveBeenCalledWith({
      emailType: 'RECIPIENT',
      source: {
        type: 'team',
        teamId: 123,
      },
      meta: {
        language: 'en',
      },
    });
    expect(mocks.customTransportSendMail).not.toHaveBeenCalled();
    expect(mailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: DOCUMENSO_INTERNAL_EMAIL,
        html: '<p>code</p>',
        text: 'code',
        to: {
          address: 'recipient@example.com',
          name: 'Recipient',
        },
      }),
    );
    expect(prisma.documentAuditLog.create).toHaveBeenCalled();
  });
});
