import { getSubscriptionClaim } from '@documenso/lib/server-only/subscription/get-subscription-claim';
import { INTERNAL_CLAIM_ID } from '@documenso/lib/types/subscription';
import { prisma } from '@documenso/prisma';
import { OrganisationType, SubscriptionStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { onSubscriptionUpdated } from './on-subscription-updated';

const mocks = vi.hoisted(() => ({
  organisationFindFirst: vi.fn(),
  organisationUpdate: vi.fn(),
  organisationClaimUpdate: vi.fn(),
  subscriptionClaimFindFirst: vi.fn(),
  subscriptionUpsert: vi.fn(),
  transaction: vi.fn(),
  getSubscriptionClaim: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    organisation: {
      findFirst: mocks.organisationFindFirst,
      update: mocks.organisationUpdate,
    },
    organisationClaim: {
      update: mocks.organisationClaimUpdate,
    },
    subscription: {
      upsert: mocks.subscriptionUpsert,
    },
    subscriptionClaim: {
      findFirst: mocks.subscriptionClaimFindFirst,
    },
    $transaction: mocks.transaction,
  },
}));

vi.mock('@documenso/lib/server-only/subscription/get-subscription-claim', () => ({
  getSubscriptionClaim: mocks.getSubscriptionClaim,
}));

vi.mock('@documenso/lib/server-only/stripe', () => ({
  stripe: {
    products: {
      retrieve: vi.fn(),
    },
  },
}));

const paidClaim = {
  id: 'claim_paid',
  flags: {
    emailDomains: true,
  },
  envelopeItemCount: 100,
  recipientCount: 100,
  teamCount: 10,
  memberCount: 25,
  documentRateLimits: [{ window: '1h', max: 10 }],
  documentQuota: 1000,
  emailRateLimits: [{ window: '1h', max: 20 }],
  emailQuota: 2000,
  apiRateLimits: [{ window: '1h', max: 30 }],
  apiQuota: 3000,
  emailTransportId: 'email_transport_paid',
};

const freeClaim = {
  id: INTERNAL_CLAIM_ID.FREE,
  flags: {},
  envelopeItemCount: 3,
  recipientCount: 3,
  teamCount: 1,
  memberCount: 1,
  documentRateLimits: [],
  documentQuota: 0,
  emailRateLimits: [],
  emailQuota: 0,
  apiRateLimits: [],
  apiQuota: 0,
  emailTransportId: null,
};

const subscription = {
  id: 'sub_123',
  customer: 'cus_123',
  status: 'canceled',
  current_period_end: 1_776_000_000,
  trial_end: null,
  cancel_at_period_end: false,
  items: {
    data: [
      {
        price: {
          id: 'price_paid',
          metadata: {
            claimId: paidClaim.id,
          },
          product: 'prod_123',
        },
      },
    ],
  },
};

describe('onSubscriptionUpdated', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.transaction.mockImplementation((callback) =>
      callback({
        subscription: {
          upsert: mocks.subscriptionUpsert,
        },
        organisationClaim: {
          update: mocks.organisationClaimUpdate,
        },
      }),
    );

    mocks.organisationFindFirst.mockResolvedValue({
      id: 'org_123',
      type: OrganisationType.ORGANISATION,
      organisationClaim: {
        id: 'org_claim_123',
      },
      subscription: null,
    });

    mocks.subscriptionClaimFindFirst.mockResolvedValue(paidClaim);
    mocks.getSubscriptionClaim.mockResolvedValue(freeClaim);
  });

  it('upserts missing subscription rows and downgrades inactive subscriptions to free claims', async () => {
    await onSubscriptionUpdated({
      subscription: subscription as unknown as Parameters<typeof onSubscriptionUpdated>[0]['subscription'],
      previousAttributes: null,
      bypassClaimUpdate: true,
    });

    expect(prisma.subscription.upsert).toHaveBeenCalledWith({
      where: {
        organisationId: 'org_123',
      },
      create: {
        organisationId: 'org_123',
        customerId: 'cus_123',
        status: SubscriptionStatus.INACTIVE,
        planId: 'sub_123',
        priceId: 'price_paid',
        periodEnd: new Date(1_776_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
      update: {
        status: SubscriptionStatus.INACTIVE,
        planId: 'sub_123',
        priceId: 'price_paid',
        periodEnd: new Date(1_776_000_000 * 1000),
        cancelAtPeriodEnd: false,
      },
    });

    expect(getSubscriptionClaim).toHaveBeenCalledWith(INTERNAL_CLAIM_ID.FREE);
    expect(prisma.organisationClaim.update).toHaveBeenCalledWith({
      where: {
        id: 'org_claim_123',
      },
      data: {
        originalSubscriptionClaimId: INTERNAL_CLAIM_ID.FREE,
        flags: {},
        envelopeItemCount: 3,
        recipientCount: 3,
        teamCount: 1,
        memberCount: 1,
        documentRateLimits: [],
        documentQuota: 0,
        emailRateLimits: [],
        emailQuota: 0,
        apiRateLimits: [],
        apiQuota: 0,
        emailTransportId: null,
      },
    });
  });
});
