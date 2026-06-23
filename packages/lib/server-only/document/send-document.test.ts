import { RecipientRole, SendStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '../../errors/app-error';
import { SEND_SIGNING_EMAIL_JOB_DEFINITION } from '../../jobs/definitions/emails/send-signing-email';
import { getEmailContext } from '../email/get-email-context';
import { assertOrganisationRatesAndLimits } from '../rate-limit/assert-organisation-rates-and-limits';
import { getSigningRequestEmailRecipients, reserveSigningRequestEmailLimits } from './send-document';

vi.mock('../email/get-email-context', () => ({
  getEmailContext: vi.fn(),
}));

vi.mock('../rate-limit/assert-organisation-rates-and-limits', () => ({
  assertOrganisationRatesAndLimits: vi.fn(),
}));

const getEmailContextMock = vi.mocked(getEmailContext);
const assertOrganisationRatesAndLimitsMock = vi.mocked(assertOrganisationRatesAndLimits);

const createRecipient = (overrides: Partial<Parameters<typeof getSigningRequestEmailRecipients>[0][number]> = {}) => ({
  email: 'recipient@example.com',
  role: RecipientRole.SIGNER,
  sendStatus: SendStatus.NOT_SENT,
  ...overrides,
});

describe('getSigningRequestEmailRecipients', () => {
  it('only returns unsent non-CC recipients with valid emails', () => {
    const eligibleRecipient = createRecipient({ email: 'eligible@example.com' });
    const recipients = [
      eligibleRecipient,
      createRecipient({ email: 'already-sent@example.com', sendStatus: SendStatus.SENT }),
      createRecipient({ email: 'cc@example.com', role: RecipientRole.CC }),
      createRecipient({ email: 'not-an-email' }),
    ];

    expect(getSigningRequestEmailRecipients(recipients)).toEqual([eligibleRecipient]);
  });
});

describe('reserveSigningRequestEmailLimits', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('reserves one email unit for each eligible signing request email', async () => {
    const claims = { id: 'claim-1' };

    getEmailContextMock.mockResolvedValueOnce({
      organisationId: 'org-1',
      claims,
      emailsDisabled: false,
    } as Awaited<ReturnType<typeof getEmailContext>>);

    const didReserve = await reserveSigningRequestEmailLimits({
      teamId: 1,
      documentMeta: null,
      recipients: [
        createRecipient({ email: 'first@example.com' }),
        createRecipient({ email: 'second@example.com' }),
        createRecipient({ email: 'already-sent@example.com', sendStatus: SendStatus.SENT }),
      ],
    });

    expect(didReserve).toBe(true);
    expect(assertOrganisationRatesAndLimitsMock).toHaveBeenCalledWith({
      organisationId: 'org-1',
      organisationClaim: claims,
      count: 2,
      type: 'email',
    });
  });

  it('does not load email context when no recipients require email limits', async () => {
    const didReserve = await reserveSigningRequestEmailLimits({
      teamId: 1,
      documentMeta: null,
      recipients: [createRecipient({ email: 'already-sent@example.com', sendStatus: SendStatus.SENT })],
    });

    expect(didReserve).toBe(false);
    expect(getEmailContextMock).not.toHaveBeenCalled();
    expect(assertOrganisationRatesAndLimitsMock).not.toHaveBeenCalled();
  });

  it('rejects distribution when signing request emails would be sent for an email-disabled organisation', async () => {
    getEmailContextMock.mockResolvedValueOnce({
      organisationId: 'org-1',
      claims: { id: 'claim-1' },
      emailsDisabled: true,
    } as Awaited<ReturnType<typeof getEmailContext>>);

    await expect(
      reserveSigningRequestEmailLimits({
        teamId: 1,
        documentMeta: null,
        recipients: [createRecipient()],
      }),
    ).rejects.toMatchObject({
      code: AppErrorCode.FORBIDDEN,
    });

    expect(assertOrganisationRatesAndLimitsMock).not.toHaveBeenCalled();
  });
});

describe('SEND_SIGNING_EMAIL_JOB_DEFINITION', () => {
  it('accepts jobs whose organisation email limits were reserved synchronously', () => {
    expect(
      SEND_SIGNING_EMAIL_JOB_DEFINITION.trigger.schema.parse({
        userId: 1,
        documentId: 1,
        recipientId: 1,
        areOrganisationEmailLimitsReserved: true,
      }),
    ).toMatchObject({
      areOrganisationEmailLimitsReserved: true,
    });
  });
});
