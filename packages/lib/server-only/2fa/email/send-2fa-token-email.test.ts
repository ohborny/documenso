import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    documentAuditLogCreate: vi.fn(),
    emailTransport: {
      sendMail: vi.fn(),
    },
    envelopeFindFirst: vi.fn(),
    generateTwoFactorTokenFromEmail: vi.fn(),
    getEmailContext: vi.fn(),
    getI18nInstance: vi.fn(),
    isRecipientEmailValidForSending: vi.fn(),
    renderEmailWithI18N: vi.fn(),
  };
});

vi.mock('@documenso/email/templates/access-auth-2fa', () => ({
  AccessAuth2FAEmailTemplate: () => null,
}));

vi.mock('@documenso/lib/utils/recipients', () => ({
  isRecipientEmailValidForSending: mocks.isRecipientEmailValidForSending,
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    documentAuditLog: {
      create: mocks.documentAuditLogCreate,
    },
    envelope: {
      findFirst: mocks.envelopeFindFirst,
    },
  },
}));

vi.mock('@lingui/core/macro', () => ({
  msg: (strings: TemplateStringsArray) => strings.join(''),
}));

vi.mock('../../../client-only/providers/i18n-server', () => ({
  getI18nInstance: mocks.getI18nInstance,
}));

vi.mock('../../../constants/app', () => ({
  NEXT_PUBLIC_WEBAPP_URL: () => 'http://localhost:3000',
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

import { send2FATokenEmail } from './send-2fa-token-email';

const recipient = {
  id: 456,
  email: 'recipient@example.com',
  name: 'Recipient',
};

const envelope = {
  id: 'envelope_123',
  title: 'Mutual NDA',
  teamId: 123,
  recipients: [recipient],
  documentMeta: null,
};

const emailContext = {
  branding: {},
  emailLanguage: 'en',
  senderEmail: {
    name: 'Documenso',
    address: 'noreply@documenso.com',
  },
  replyToEmail: undefined,
  emailsDisabled: false,
  emailTransport: mocks.emailTransport,
};

describe('send2FATokenEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.envelopeFindFirst.mockResolvedValue(envelope);
    mocks.generateTwoFactorTokenFromEmail.mockResolvedValue('123456');
    mocks.getEmailContext.mockResolvedValue(emailContext);
    mocks.getI18nInstance.mockResolvedValue({
      _: () => 'Your two-factor authentication code',
    });
    mocks.isRecipientEmailValidForSending.mockReturnValue(true);
    mocks.renderEmailWithI18N.mockResolvedValueOnce('<html />').mockResolvedValueOnce('text');
  });

  it('requests trusted delivery for the generated 2FA code', async () => {
    await send2FATokenEmail({
      token: 'recipient-token',
      envelopeId: envelope.id,
    });

    expect(mocks.getEmailContext).toHaveBeenCalledWith({
      emailType: 'RECIPIENT',
      trustedDelivery: true,
      source: {
        type: 'team',
        teamId: envelope.teamId,
      },
      meta: envelope.documentMeta,
    });
    expect(mocks.generateTwoFactorTokenFromEmail).toHaveBeenCalledWith({
      envelopeId: envelope.id,
      email: recipient.email,
    });
    expect(mocks.emailTransport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: {
          address: recipient.email,
          name: recipient.name,
        },
        from: emailContext.senderEmail,
      }),
    );
    expect(mocks.documentAuditLogCreate).toHaveBeenCalled();
  });

  it('does not generate or send a 2FA code when organisation emails are disabled', async () => {
    mocks.getEmailContext.mockResolvedValueOnce({
      ...emailContext,
      emailsDisabled: true,
    });

    await send2FATokenEmail({
      token: 'recipient-token',
      envelopeId: envelope.id,
    });

    expect(mocks.generateTwoFactorTokenFromEmail).not.toHaveBeenCalled();
    expect(mocks.renderEmailWithI18N).not.toHaveBeenCalled();
    expect(mocks.emailTransport.sendMail).not.toHaveBeenCalled();
    expect(mocks.documentAuditLogCreate).not.toHaveBeenCalled();
  });
});
