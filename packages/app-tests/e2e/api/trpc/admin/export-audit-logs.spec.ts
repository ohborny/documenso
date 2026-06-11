import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { prisma } from '@documenso/prisma';
import { UserSecurityAuditLogType } from '@documenso/prisma/client';
import { seedBlankDocument } from '@documenso/prisma/seed/documents';
import { seedUser } from '@documenso/prisma/seed/users';
import type { Page } from '@playwright/test';
import { expect, test } from '@playwright/test';

import { apiSignin } from '../../../fixtures/authentication';

const WEBAPP_BASE_URL = NEXT_PUBLIC_WEBAPP_URL();

test.describe.configure({ mode: 'parallel' });

type AuditExportResponse = {
  data: string;
  filename: string;
  mimeType: string;
  counts: {
    document: number;
    userSecurity: number;
    exported: number;
  };
};

const callExportAuditLogs = async (
  page: Page,
  input: {
    format?: 'CSV' | 'JSON';
    source?: 'ALL' | 'DOCUMENT' | 'USER_SECURITY';
    limit?: number;
  },
) => {
  return await page.context().request.post(`${WEBAPP_BASE_URL}/api/trpc/admin.auditLog.export`, {
    headers: { 'content-type': 'application/json' },
    data: JSON.stringify({ json: input }),
  });
};

const parseExportResponse = async (response: Awaited<ReturnType<typeof callExportAuditLogs>>) => {
  const body = await response.json();

  return body.result.data.json as AuditExportResponse;
};

test('[ADMIN][TRPC][AUDIT_EXPORT]: unauthenticated request is rejected with 401', async ({ page }) => {
  const res = await callExportAuditLogs(page, {
    format: 'CSV',
    source: 'ALL',
    limit: 10,
  });

  expect(res.ok()).toBeFalsy();
  expect(res.status()).toBe(401);
});

test('[ADMIN][TRPC][AUDIT_EXPORT]: non-admin request is rejected with 401', async ({ page }) => {
  const { user } = await seedUser({ isAdmin: false });

  await apiSignin({ page, email: user.email });

  const res = await callExportAuditLogs(page, {
    format: 'CSV',
    source: 'ALL',
    limit: 10,
  });

  expect(res.ok()).toBeFalsy();
  expect(res.status()).toBe(401);
});

test('[ADMIN][TRPC][AUDIT_EXPORT]: admin can export document and security audit logs as CSV', async ({ page }) => {
  const { user: adminUser } = await seedUser({ isAdmin: true });
  const { user: owner, team } = await seedUser();
  const document = await seedBlankDocument(owner, team.id, {
    createDocumentOptions: {
      title: 'SOC2 Export Test Document',
    },
  });

  await prisma.documentAuditLog.create({
    data: {
      envelopeId: document.id,
      type: 'DOCUMENT_AUDIT_LOG_EXPORTED',
      data: {
        format: 'PDF',
      },
      userId: owner.id,
      name: owner.name,
      email: owner.email,
      ipAddress: '127.0.0.1',
      userAgent: 'Playwright',
    },
  });

  await prisma.userSecurityAuditLog.create({
    data: {
      userId: owner.id,
      type: UserSecurityAuditLogType.PASSWORD_UPDATE,
      ipAddress: '127.0.0.1',
      userAgent: 'Playwright',
    },
  });

  await apiSignin({ page, email: adminUser.email });

  const res = await callExportAuditLogs(page, {
    format: 'CSV',
    source: 'ALL',
    limit: 50,
  });

  expect(res.ok()).toBeTruthy();

  const result = await parseExportResponse(res);

  expect(result.filename).toMatch(/^documenso-soc2-audit-export-.+\.csv$/);
  expect(result.mimeType).toBe('text/csv;charset=utf-8');
  expect(result.counts.document).toBeGreaterThanOrEqual(1);
  expect(result.counts.userSecurity).toBeGreaterThanOrEqual(1);
  expect(result.counts.exported).toBeGreaterThanOrEqual(2);
  expect(result.data).toContain('id,source,createdAt,eventType');
  expect(result.data).toContain('DOCUMENT_AUDIT_LOG_EXPORTED');
  expect(result.data).toContain('PASSWORD_UPDATE');
  expect(result.data).toContain('SOC2 Export Test Document');

  const exportAuditLog = await prisma.userSecurityAuditLog.findFirst({
    where: {
      userId: adminUser.id,
      type: UserSecurityAuditLogType.AUDIT_LOG_EXPORTED,
    },
  });

  expect(exportAuditLog).not.toBeNull();
});
