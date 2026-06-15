import { mailer } from '@documenso/email/mailer';
import { prisma } from '@documenso/prisma';
import { describe, expect, it, vi } from 'vitest';

import { DOCUMENSO_INTERNAL_EMAIL } from '../../../constants/email';
import { getEmailContext } from '../../email/get-email-context';
import { generateTwoFactorTokenFromEmail } from './generate-2fa-token-from-email';
import { send2FATokenEmail } from './send-2fa-token-email';

vi.mock('@documenso/email/mailer', () => ({
  mailer: {
    sendMail: vi.fn(),
  },
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    documentAuditLog: {
      create: vi.fn(),
    },
    envelope: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@documenso/lib/utils/recipients', () => ({
  isRecipientEmailValidForSending: vi.fn(() => true),
}));

vi.mock('@prisma/client', () => ({
  EnvelopeType: {
    DOCUMENT: 'DOCUMENT',
  },
}));

vi.mock('../../../client-only/providers/i18n-server', () => ({
  getI18nInstance: vi.fn().mockResolvedValue({
    _: vi.fn(() => 'Your two-factor authentication code'),
  }),
}));

vi.mock('../../../utils/render-email-with-i18n', () => ({
  renderEmailWithI18N: vi.fn().mockResolvedValue('rendered-email'),
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
  getEmailContext: vi.fn(),
}));

vi.mock('./generate-2fa-token-from-email', () => ({
  generateTwoFactorTokenFromEmail: vi.fn(),
}));

describe('send2FATokenEmail', () => {
  it('uses the trusted mailer instead of the organisation email transport', async () => {
    const organisationTransport = {
      sendMail: vi.fn().mockRejectedValue(new Error('SMTP credentials rejected')),
    };

    vi.mocked(prisma.envelope.findFirst).mockResolvedValue({
      id: 'envelope-1',
      title: 'Critical Contract',
      teamId: 1,
      documentMeta: {
        language: 'en',
      },
      recipients: [
        {
          id: 1,
          email: 'recipient@example.com',
          name: 'Recipient User',
        },
      ],
    } as Awaited<ReturnType<typeof prisma.envelope.findFirst>>);

    vi.mocked(getEmailContext).mockResolvedValue({
      allowedEmails: [],
      branding: {},
      claims: {
        emailTransportId: 'custom-transport',
      },
      emailLanguage: 'en',
      emailsDisabled: false,
      emailTransport: organisationTransport,
      organisationId: 'org-1',
      organisationType: 'GLOBAL',
      replyToEmail: 'reply-to@example.com',
      senderEmail: {
        address: 'custom@example.com',
        name: 'Custom Sender',
      },
      settings: {
        brandingEnabled: false,
        documentLanguage: 'en',
      },
    } as Awaited<ReturnType<typeof getEmailContext>>);

    vi.mocked(generateTwoFactorTokenFromEmail).mockResolvedValue('123456');

    await send2FATokenEmail({
      envelopeId: 'envelope-1',
      token: 'recipient-token',
    });

    expect(organisationTransport.sendMail).not.toHaveBeenCalled();
    expect(mailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: DOCUMENSO_INTERNAL_EMAIL,
        subject: 'Your two-factor authentication code',
        to: {
          address: 'recipient@example.com',
          name: 'Recipient User',
        },
      }),
    );
    expect(prisma.documentAuditLog.create).toHaveBeenCalledOnce();
  });
});
