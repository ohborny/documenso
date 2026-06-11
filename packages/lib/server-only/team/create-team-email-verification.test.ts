import { mailer } from '@documenso/email/mailer';
import { DOCUMENSO_INTERNAL_EMAIL } from '@documenso/lib/constants/email';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getEmailContext } from '../email/get-email-context';
import { sendTeamEmailVerificationEmail } from './create-team-email-verification';

const mocks = vi.hoisted(() => ({
  customTransportSendMail: vi.fn(),
  getEmailContext: vi.fn(),
  getI18nInstance: vi.fn(),
  mailerSendMail: vi.fn(),
  renderEmailWithI18N: vi.fn(),
}));

vi.mock('@documenso/email/mailer', () => ({
  mailer: {
    sendMail: mocks.mailerSendMail,
  },
}));

vi.mock('@documenso/email/templates/confirm-team-email', () => ({
  ConfirmTeamEmailTemplate: () => null,
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {},
}));

vi.mock('@lingui/core/macro', () => ({
  msg: (strings: TemplateStringsArray, teamName: string) => `${strings[0]}${teamName}${strings[1]}`,
}));

vi.mock('../../client-only/providers/i18n-server', () => ({
  getI18nInstance: mocks.getI18nInstance,
}));

vi.mock('../../constants/app', () => ({
  NEXT_PUBLIC_WEBAPP_URL: () => 'https://app.example.com',
}));

vi.mock('../../utils/env', () => ({
  env: () => 'https://app.example.com',
}));

vi.mock('../../utils/render-email-with-i18n', () => ({
  renderEmailWithI18N: mocks.renderEmailWithI18N,
}));

vi.mock('../email/get-email-context', () => ({
  getEmailContext: mocks.getEmailContext,
}));

describe('sendTeamEmailVerificationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getI18nInstance.mockResolvedValue({
      _: (message: string) => message,
    });
    mocks.renderEmailWithI18N.mockResolvedValueOnce('<p>verify</p>').mockResolvedValueOnce('verify');
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
    });
  });

  it('sends verification bearer links through the trusted Documenso mailer', async () => {
    await sendTeamEmailVerificationEmail('owner@example.com', 'verification-token', {
      id: 123,
      name: 'Acme',
      url: 'acme',
    } as never);

    expect(getEmailContext).toHaveBeenCalledWith({
      emailType: 'INTERNAL',
      source: {
        type: 'team',
        teamId: 123,
      },
    });
    expect(mocks.customTransportSendMail).not.toHaveBeenCalled();
    expect(mailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: DOCUMENSO_INTERNAL_EMAIL,
        html: '<p>verify</p>',
        text: 'verify',
        to: 'owner@example.com',
      }),
    );
  });
});
