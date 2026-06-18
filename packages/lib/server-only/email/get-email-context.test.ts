import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  return {
    customTransport: {
      sendMail: vi.fn(),
    },
    mailer: {
      sendMail: vi.fn(),
    },
    organisationFindFirst: vi.fn(),
    resolveEmailTransport: vi.fn(),
  };
});

vi.mock('@documenso/email/mailer', () => ({
  mailer: mocks.mailer,
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    organisation: {
      findFirst: mocks.organisationFindFirst,
    },
  },
}));

vi.mock('./resolve-email-transport', () => ({
  resolveEmailTransport: mocks.resolveEmailTransport,
}));

import { DOCUMENSO_INTERNAL_EMAIL } from '../../constants/email';
import { getEmailContext } from './get-email-context';

const organisationGlobalSettings = {
  documentLanguage: 'en',
  emailId: null,
  emailReplyTo: null,
  brandingEnabled: false,
  brandingLogo: null,
};

const organisation = {
  id: 'org_123',
  type: 'ORGANISATION',
  owner: {
    disabled: false,
  },
  organisationClaim: {
    emailTransportId: 'email_transport_123',
    flags: {
      disableEmails: false,
      emailDomains: false,
      hidePoweredBy: false,
    },
  },
  organisationGlobalSettings,
  emailDomains: [],
};

describe('getEmailContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.organisationFindFirst.mockResolvedValue(organisation);
    mocks.resolveEmailTransport.mockResolvedValue({
      row: {
        fromName: 'Tenant Mailer',
        fromAddress: 'tenant@example.com',
      },
      transporter: mocks.customTransport,
    });
  });

  it('uses the configured transport by default', async () => {
    const emailContext = await getEmailContext({
      emailType: 'INTERNAL',
      source: {
        type: 'organisation',
        organisationId: organisation.id,
      },
    });

    expect(mocks.resolveEmailTransport).toHaveBeenCalledWith('email_transport_123');
    expect(emailContext.emailTransport).toBe(mocks.customTransport);
    expect(emailContext.senderEmail).toEqual({
      name: 'Tenant Mailer',
      address: 'tenant@example.com',
    });
  });

  it('uses Documenso mail infrastructure for trusted delivery', async () => {
    const emailContext = await getEmailContext({
      emailType: 'INTERNAL',
      trustedDelivery: true,
      source: {
        type: 'organisation',
        organisationId: organisation.id,
      },
    });

    expect(mocks.resolveEmailTransport).not.toHaveBeenCalled();
    expect(emailContext.emailTransport).toBe(mocks.mailer);
    expect(emailContext.senderEmail).toEqual(DOCUMENSO_INTERNAL_EMAIL);
    expect(emailContext.replyToEmail).toBeUndefined();
  });
});
