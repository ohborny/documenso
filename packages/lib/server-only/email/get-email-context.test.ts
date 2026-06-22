import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AppError, AppErrorCode } from '../../errors/app-error';

const mockPrisma = vi.hoisted(() => ({
  organisation: {
    findFirst: vi.fn(),
  },
}));

const mockMailer = vi.hoisted(() => ({
  sendMail: vi.fn(),
}));

const mockResolveEmailTransport = vi.hoisted(() => vi.fn());

vi.mock('@documenso/prisma', () => ({
  prisma: mockPrisma,
}));

vi.mock('@documenso/email/mailer', () => ({
  mailer: mockMailer,
}));

vi.mock('./resolve-email-transport', () => ({
  resolveEmailTransport: mockResolveEmailTransport,
}));

vi.mock('../../utils/logger', () => ({
  logger: {
    error: vi.fn(),
  },
}));

const getOrganisation = (emailTransportId: string | null = null) => ({
  id: 'org_123',
  type: 'ORGANISATION',
  owner: {
    disabled: false,
  },
  organisationClaim: {
    id: 'claim_123',
    flags: {
      emailDomains: false,
    },
    emailTransportId,
  },
  organisationGlobalSettings: {
    brandingEnabled: false,
    brandingLogo: null,
    documentLanguage: 'en',
    emailId: null,
    emailReplyTo: null,
  },
  emailDomains: [],
});

describe('getEmailContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fails closed when a configured email transport cannot be resolved', async () => {
    const { getEmailContext } = await import('./get-email-context');

    mockPrisma.organisation.findFirst.mockResolvedValue(getOrganisation('transport_123'));
    mockResolveEmailTransport.mockResolvedValue(null);

    await expect(
      getEmailContext({
        emailType: 'INTERNAL',
        source: {
          type: 'organisation',
          organisationId: 'org_123',
        },
      }),
    ).rejects.toMatchObject({
      code: AppErrorCode.UNKNOWN_ERROR,
      message: 'Configured email transport could not be resolved',
    } satisfies Partial<AppError>);

    expect(mockResolveEmailTransport).toHaveBeenCalledWith('transport_123');
  });

  it('uses the system mailer when no email transport is configured', async () => {
    const { getEmailContext } = await import('./get-email-context');

    mockPrisma.organisation.findFirst.mockResolvedValue(getOrganisation());

    const emailContext = await getEmailContext({
      emailType: 'INTERNAL',
      source: {
        type: 'organisation',
        organisationId: 'org_123',
      },
    });

    expect(mockResolveEmailTransport).not.toHaveBeenCalled();
    expect(emailContext.emailTransport).toBe(mockMailer);
  });
});
