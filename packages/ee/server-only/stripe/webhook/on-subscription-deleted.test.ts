import { getSubscriptionClaim } from '@documenso/lib/server-only/subscription/get-subscription-claim';
import { INTERNAL_CLAIM_ID } from '@documenso/lib/types/subscription';
import { prisma } from '@documenso/prisma';
import { SubscriptionStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { onSubscriptionDeleted } from './on-subscription-deleted';

const mocks = vi.hoisted(() => ({
  subscriptionFindUnique: vi.fn(),
  subscriptionUpdate: vi.fn(),
  organisationClaimUpdate: vi.fn(),
  transaction: vi.fn(),
  getSubscriptionClaim: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    subscription: {
      findUnique: mocks.subscriptionFindUnique,
      update: mocks.subscriptionUpdate,
    },
    organisationClaim: {
      update: mocks.organisationClaimUpdate,
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
  items: {
    data: [
      {
        price: {
          id: 'price_team',
          metadata: {
            claimId: 'claim_team',
          },
          product: 'prod_123',
        },
      },
    ],
  },
};

describe('onSubscriptionDeleted', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.transaction.mockImplementation((callback) =>
      callback({
        subscription: {
          update: mocks.subscriptionUpdate,
        },
        organisationClaim: {
          update: mocks.organisationClaimUpdate,
        },
      }),
    );

    mocks.subscriptionFindUnique.mockResolvedValue({
      id: 1,
      organisation: {
        organisationClaim: {
          id: 'org_claim_123',
        },
      },
    });

    mocks.getSubscriptionClaim.mockResolvedValue(freeClaim);
  });

  it('keeps non-individual subscription rows inactive and resets claims to free', async () => {
    await onSubscriptionDeleted({
      subscription: subscription as unknown as Parameters<typeof onSubscriptionDeleted>[0]['subscription'],
    });

    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: {
        id: 1,
      },
      data: {
        status: SubscriptionStatus.INACTIVE,
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
