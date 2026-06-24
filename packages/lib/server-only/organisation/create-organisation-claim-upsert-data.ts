import type { OrganisationClaim, Prisma, SubscriptionClaim } from '@prisma/client';

type ClaimEntitlements = Pick<
  SubscriptionClaim | OrganisationClaim,
  | 'flags'
  | 'envelopeItemCount'
  | 'recipientCount'
  | 'teamCount'
  | 'memberCount'
  | 'documentRateLimits'
  | 'documentQuota'
  | 'emailRateLimits'
  | 'emailQuota'
  | 'apiRateLimits'
  | 'apiQuota'
  | 'emailTransportId'
>;

export const createOrganisationClaimUpsertData = (subscriptionClaim: ClaimEntitlements) => {
  // Done like this to ensure type errors are thrown if items are added.
  const data: Omit<Prisma.SubscriptionClaimUncheckedCreateInput, 'id' | 'createdAt' | 'updatedAt' | 'locked' | 'name'> =
    {
      flags: {
        ...subscriptionClaim.flags,
      },
      envelopeItemCount: subscriptionClaim.envelopeItemCount,
      recipientCount: subscriptionClaim.recipientCount,
      teamCount: subscriptionClaim.teamCount,
      memberCount: subscriptionClaim.memberCount,
      documentRateLimits: subscriptionClaim.documentRateLimits ?? [],
      documentQuota: subscriptionClaim.documentQuota,
      emailRateLimits: subscriptionClaim.emailRateLimits ?? [],
      emailQuota: subscriptionClaim.emailQuota,
      apiRateLimits: subscriptionClaim.apiRateLimits ?? [],
      apiQuota: subscriptionClaim.apiQuota,
      emailTransportId: subscriptionClaim.emailTransportId ?? null,
    };

  return {
    ...data,
  };
};
