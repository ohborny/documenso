import { describe, expect, it } from 'vitest';

import { createOrganisationClaimUpsertData } from './create-organisation-claim-upsert-data';

describe('createOrganisationClaimUpsertData', () => {
  it('copies all organisation claim entitlements', () => {
    const sourceClaim = {
      flags: {
        allowLegacyEnvelopes: true,
        emailDomains: true,
      },
      envelopeItemCount: 20,
      recipientCount: 30,
      teamCount: 4,
      memberCount: 12,
      documentRateLimits: [{ window: '1h', max: 10 }],
      documentQuota: 100,
      emailRateLimits: [{ window: '1d', max: 50 }],
      emailQuota: 200,
      apiRateLimits: [{ window: '1m', max: 5 }],
      apiQuota: 300,
      emailTransportId: 'email_transport_123',
    };

    expect(createOrganisationClaimUpsertData(sourceClaim)).toEqual({
      flags: {
        allowLegacyEnvelopes: true,
        emailDomains: true,
      },
      envelopeItemCount: 20,
      recipientCount: 30,
      teamCount: 4,
      memberCount: 12,
      documentRateLimits: [{ window: '1h', max: 10 }],
      documentQuota: 100,
      emailRateLimits: [{ window: '1d', max: 50 }],
      emailQuota: 200,
      apiRateLimits: [{ window: '1m', max: 5 }],
      apiQuota: 300,
      emailTransportId: 'email_transport_123',
    });
  });

  it('normalizes missing rate limits and email transport values', () => {
    const sourceClaim = {
      flags: {},
      envelopeItemCount: 20,
      recipientCount: 30,
      teamCount: 4,
      memberCount: 12,
      documentRateLimits: null,
      documentQuota: null,
      emailRateLimits: null,
      emailQuota: null,
      apiRateLimits: null,
      apiQuota: null,
      emailTransportId: null,
    };

    expect(createOrganisationClaimUpsertData(sourceClaim)).toMatchObject({
      documentRateLimits: [],
      emailRateLimits: [],
      apiRateLimits: [],
      emailTransportId: null,
    });
  });
});
