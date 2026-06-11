import { z } from 'zod';

export const ZAdminAuditLogExportFormatSchema = z.enum(['CSV', 'JSON']);
export const ZAdminAuditLogExportSourceSchema = z.enum(['ALL', 'DOCUMENT', 'USER_SECURITY']);

export const ZAdminExportAuditLogsRequestSchema = z.object({
  format: ZAdminAuditLogExportFormatSchema.default('CSV'),
  source: ZAdminAuditLogExportSourceSchema.default('ALL'),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(10000).default(5000),
});

export const ZAdminExportAuditLogsResponseSchema = z.object({
  data: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  exportedAt: z.date(),
  counts: z.object({
    document: z.number(),
    userSecurity: z.number(),
    exported: z.number(),
  }),
});

export type TAdminExportAuditLogsRequest = z.infer<typeof ZAdminExportAuditLogsRequestSchema>;
export type TAdminExportAuditLogsResponse = z.infer<typeof ZAdminExportAuditLogsResponseSchema>;
