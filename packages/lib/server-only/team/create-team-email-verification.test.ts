import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    emailTransport: {
      sendMail: vi.fn(),
    },
    getEmailContext: vi.fn(),
    getI18nInstance: vi.fn(),
    renderEmailWithI18N: vi.fn(),
  };
});

vi.mock('@documenso/email/templates/confirm-team-email', () => ({
  ConfirmTeamEmailTemplate: () => null,
}));

vi.mock('@documenso/lib/constants/app', () => ({
  NEXT_PUBLIC_WEBAPP_URL: () => 'http://localhost:3000',
}));

vi.mock('@lingui/core/macro', () => ({
  msg: (strings: TemplateStringsArray) => strings.join(''),
}));

vi.mock('../../client-only/providers/i18n-server', () => ({
  getI18nInstance: mocks.getI18nInstance,
}));

vi.mock('../../utils/env', () => ({
  env: () => 'http://localhost:3000',
}));

vi.mock('../../utils/render-email-with-i18n', () => ({
  renderEmailWithI18N: mocks.renderEmailWithI18N,
}));

vi.mock('../email/get-email-context', () => ({
  getEmailContext: mocks.getEmailContext,
}));

import { sendTeamEmailVerificationEmail } from './create-team-email-verification';

const team = {
  id: 123,
  name: 'Acme Legal',
  url: 'acme-legal',
};

const emailContext = {
  branding: {},
  emailLanguage: 'en',
  senderEmail: {
    name: 'Documenso',
    address: 'noreply@documenso.com',
  },
  emailsDisabled: false,
  emailTransport: mocks.emailTransport,
};

describe('sendTeamEmailVerificationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getEmailContext.mockResolvedValue(emailContext);
    mocks.getI18nInstance.mockResolvedValue({
      _: () => 'A request to use your email has been initiated by Acme Legal on Documenso',
    });
    mocks.renderEmailWithI18N.mockResolvedValueOnce('<html />').mockResolvedValueOnce('text');
  });

  it('requests trusted delivery for the verification token email', async () => {
    await sendTeamEmailVerificationEmail('owner@example.com', 'verification-token', team as never);

    expect(mocks.getEmailContext).toHaveBeenCalledWith({
      emailType: 'INTERNAL',
      trustedDelivery: true,
      source: {
        type: 'team',
        teamId: team.id,
      },
    });
    expect(mocks.emailTransport.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'owner@example.com',
        from: emailContext.senderEmail,
      }),
    );
  });

  it('does not render or send when organisation emails are disabled', async () => {
    mocks.getEmailContext.mockResolvedValueOnce({
      ...emailContext,
      emailsDisabled: true,
    });

    await sendTeamEmailVerificationEmail('owner@example.com', 'verification-token', team as never);

    expect(mocks.renderEmailWithI18N).not.toHaveBeenCalled();
    expect(mocks.emailTransport.sendMail).not.toHaveBeenCalled();
  });
});
