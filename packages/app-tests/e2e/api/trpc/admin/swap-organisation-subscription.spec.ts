import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { createPersonalOrganisation } from '@documenso/lib/server-only/organisation/create-organisation';
import { generateDatabaseId } from '@documenso/lib/universal/id';
import { prisma } from '@documenso/prisma';
import { EmailTransportType, OrganisationType, SubscriptionStatus } from '@documenso/prisma/client';
import { seedUser } from '@documenso/prisma/seed/users';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { apiSignin } from '../../../fixtures/authentication';

const WEBAPP_BASE_URL = NEXT_PUBLIC_WEBAPP_URL();

test.describe.configure({ mode: 'parallel' });

const callSwapOrganisationSubscription = async (
  page: Page,
  input: {
    sourceOrganisationId: string;
    targetOrganisationId: string;
  },
) => {
  return await page.context().request.post(`${WEBAPP_BASE_URL}/api/trpc/admin.organisation.subscription.swap`, {
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({ json: input }),
  });
};

test('[ADMIN][TRPC][SWAP_ORG_SUBSCRIPTION]: copies quota and rate-limit entitlements to target org', async ({
  page,
}) => {
  const { user, organisation: sourceOrganisation } = await seedUser({ isAdmin: true });

  const targetOrganisation = await createPersonalOrganisation({
    userId: user.id,
    orgUrl: generateDatabaseId('org'),
    type: OrganisationType.ORGANISATION,
    throwErrorOnOrganisationCreationFailure: true,
  });

  expect(targetOrganisation).toBeTruthy();

  if (!targetOrganisation) {
    throw new Error('Target organisation was not created');
  }

  const emailTransport = await prisma.emailTransport.create({
    data: {
      id: generateDatabaseId('email_transport'),
      name: 'Swap regression transport',
      type: EmailTransportType.RESEND,
      fromName: 'Documenso',
      fromAddress: 'notifications@example.com',
      config: '{}',
    },
  });

  const sourceEntitlements = {
    originalSubscriptionClaimId: 'claim_swap_regression_paid',
    teamCount: 12,
    memberCount: 34,
    envelopeItemCount: 56,
    recipientCount: 78,
    flags: {
      allowCustomBranding: true,
      disableEmails: true,
    },
    documentRateLimits: [{ window: '1m', max: 2 }],
    documentQuota: 100,
    emailRateLimits: [{ window: '1h', max: 5 }],
    emailQuota: 200,
    apiRateLimits: [{ window: '1d', max: 10 }],
    apiQuota: 300,
    emailTransportId: emailTransport.id,
  };

  await prisma.organisation.update({
    where: { id: sourceOrganisation.id },
    data: { customerId: 'cus_swap_regression_source' },
  });

  await prisma.subscription.create({
    data: {
      organisationId: sourceOrganisation.id,
      status: SubscriptionStatus.ACTIVE,
      planId: 'plan_swap_regression_source',
      priceId: 'price_swap_regression_source',
      customerId: 'cus_swap_regression_source',
    },
  });

  await prisma.organisationClaim.update({
    where: { id: sourceOrganisation.organisationClaim.id },
    data: sourceEntitlements,
  });

  await apiSignin({ page, email: user.email });

  const res = await callSwapOrganisationSubscription(page, {
    sourceOrganisationId: sourceOrganisation.id,
    targetOrganisationId: targetOrganisation.id,
  });

  expect(res.ok()).toBeTruthy();

  const sourceClaim = await prisma.organisationClaim.findUniqueOrThrow({
    where: { id: sourceOrganisation.organisationClaim.id },
  });

  const targetClaim = await prisma.organisationClaim.findFirstOrThrow({
    where: { organisation: { id: targetOrganisation.id } },
  });

  expect(targetClaim).toMatchObject(sourceEntitlements);

  expect(sourceClaim.originalSubscriptionClaimId).toBe('free');
  expect(sourceClaim.documentRateLimits).toEqual([]);
  expect(sourceClaim.documentQuota).toBeNull();
  expect(sourceClaim.emailRateLimits).toEqual([]);
  expect(sourceClaim.emailQuota).toBeNull();
  expect(sourceClaim.apiRateLimits).toEqual([]);
  expect(sourceClaim.apiQuota).toBeNull();
  expect(sourceClaim.emailTransportId).toBeNull();
});
