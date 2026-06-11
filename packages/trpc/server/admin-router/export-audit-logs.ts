import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';
import { type Prisma, UserSecurityAuditLogType } from '@prisma/client';

import { adminProcedure } from '../trpc';
import {
  type TAdminExportAuditLogsRequest,
  ZAdminExportAuditLogsRequestSchema,
  ZAdminExportAuditLogsResponseSchema,
} from './export-audit-logs.types';

type AuditLogExportRow = {
  id: string;
  source: 'DOCUMENT' | 'USER_SECURITY';
  createdAt: string;
  eventType: string;
  actorUserId: string;
  actorName: string;
  actorEmail: string;
  subjectType: 'document' | 'user';
  subjectId: string;
  subjectName: string;
  ipAddress: string;
  userAgent: string;
  metadata: string;
  sortDate: number;
};

const CSV_HEADERS: (keyof Omit<AuditLogExportRow, 'sortDate'>)[] = [
  'id',
  'source',
  'createdAt',
  'eventType',
  'actorUserId',
  'actorName',
  'actorEmail',
  'subjectType',
  'subjectId',
  'subjectName',
  'ipAddress',
  'userAgent',
  'metadata',
];

const getDateRange = ({ dateFrom, dateTo }: Pick<TAdminExportAuditLogsRequest, 'dateFrom' | 'dateTo'>) => {
  const from = dateFrom ? new Date(dateFrom) : undefined;
  const to = dateTo ? new Date(dateTo) : undefined;

  if (from && to && from > to) {
    throw new AppError(AppErrorCode.INVALID_REQUEST, {
      message: 'dateFrom must be before dateTo',
    });
  }

  return { from, to };
};

const getCreatedAtWhere = ({ from, to }: ReturnType<typeof getDateRange>) => {
  if (!from && !to) {
    return {};
  }

  return {
    createdAt: {
      gte: from,
      lte: to,
    },
  };
};

const escapeCsvValue = (value: string | number) => {
  const stringValue = String(value);
  const shouldEscape = /[",\n\r]/.test(stringValue);

  if (!shouldEscape) {
    return stringValue;
  }

  return `"${stringValue.replace(/"/g, '""')}"`;
};

const serializeCsv = (rows: Omit<AuditLogExportRow, 'sortDate'>[]) => {
  const header = CSV_HEADERS.join(',');

  const body = rows.map((row) => CSV_HEADERS.map((header) => escapeCsvValue(row[header])).join(','));

  return [header, ...body].join('\n');
};

const serializeJson = ({
  rows,
  exportedAt,
  input,
  counts,
}: {
  rows: Omit<AuditLogExportRow, 'sortDate'>[];
  exportedAt: Date;
  input: TAdminExportAuditLogsRequest;
  counts: {
    document: number;
    userSecurity: number;
    exported: number;
  };
}) => {
  return JSON.stringify(
    {
      schemaVersion: 1,
      exportedAt: exportedAt.toISOString(),
      filters: input,
      counts,
      rows,
    },
    null,
    2,
  );
};

const getExportFilename = (exportedAt: Date, format: TAdminExportAuditLogsRequest['format']) => {
  const timestamp = exportedAt.toISOString().replace(/[:.]/g, '-');

  return `documenso-soc2-audit-export-${timestamp}.${format.toLowerCase()}`;
};

export const exportAuditLogsRoute = adminProcedure
  .input(ZAdminExportAuditLogsRequestSchema)
  .output(ZAdminExportAuditLogsResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { format, source, limit } = input;
    const dateRange = getDateRange(input);
    const createdAtWhere = getCreatedAtWhere(dateRange);
    const documentWhere = createdAtWhere satisfies Prisma.DocumentAuditLogWhereInput;
    const userSecurityWhere = createdAtWhere satisfies Prisma.UserSecurityAuditLogWhereInput;

    ctx.logger.info({
      input: {
        format,
        source,
        dateFrom: input.dateFrom,
        dateTo: input.dateTo,
        limit,
      },
    });

    const shouldIncludeDocumentLogs = source === 'ALL' || source === 'DOCUMENT';
    const shouldIncludeUserSecurityLogs = source === 'ALL' || source === 'USER_SECURITY';

    const [documentAuditLogs, documentCount, userSecurityAuditLogs, userSecurityCount] = await Promise.all([
      shouldIncludeDocumentLogs
        ? prisma.documentAuditLog.findMany({
            where: documentWhere,
            take: limit,
            orderBy: {
              createdAt: 'desc',
            },
            include: {
              envelope: {
                select: {
                  id: true,
                  title: true,
                  secondaryId: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      shouldIncludeDocumentLogs ? prisma.documentAuditLog.count({ where: documentWhere }) : Promise.resolve(0),
      shouldIncludeUserSecurityLogs
        ? prisma.userSecurityAuditLog.findMany({
            where: userSecurityWhere,
            take: limit,
            orderBy: {
              createdAt: 'desc',
            },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          })
        : Promise.resolve([]),
      shouldIncludeUserSecurityLogs
        ? prisma.userSecurityAuditLog.count({ where: userSecurityWhere })
        : Promise.resolve(0),
    ]);

    const documentRows = documentAuditLogs.map((auditLog): AuditLogExportRow => {
      const envelopeTitle = auditLog.envelope?.title ?? '';

      return {
        id: auditLog.id,
        source: 'DOCUMENT',
        createdAt: auditLog.createdAt.toISOString(),
        eventType: auditLog.type,
        actorUserId: auditLog.userId ? String(auditLog.userId) : '',
        actorName: auditLog.name ?? '',
        actorEmail: auditLog.email ?? '',
        subjectType: 'document',
        subjectId: auditLog.envelopeId ?? auditLog.envelope?.id ?? '',
        subjectName: envelopeTitle,
        ipAddress: auditLog.ipAddress ?? '',
        userAgent: auditLog.userAgent ?? '',
        metadata: JSON.stringify(auditLog.data),
        sortDate: auditLog.createdAt.getTime(),
      };
    });

    const userSecurityRows = userSecurityAuditLogs.map((auditLog): AuditLogExportRow => {
      return {
        id: String(auditLog.id),
        source: 'USER_SECURITY',
        createdAt: auditLog.createdAt.toISOString(),
        eventType: auditLog.type,
        actorUserId: String(auditLog.userId),
        actorName: auditLog.user.name ?? '',
        actorEmail: auditLog.user.email,
        subjectType: 'user',
        subjectId: String(auditLog.userId),
        subjectName: auditLog.user.name ?? auditLog.user.email,
        ipAddress: auditLog.ipAddress ?? '',
        userAgent: auditLog.userAgent ?? '',
        metadata: '',
        sortDate: auditLog.createdAt.getTime(),
      };
    });

    const rows = [...documentRows, ...userSecurityRows]
      .sort((a, b) => b.sortDate - a.sortDate)
      .slice(0, limit)
      .map(({ sortDate: _sortDate, ...row }) => row);

    const counts = {
      document: documentCount,
      userSecurity: userSecurityCount,
      exported: rows.length,
    };

    const exportedAt = new Date();
    const data = format === 'CSV' ? serializeCsv(rows) : serializeJson({ rows, exportedAt, input, counts });

    await prisma.userSecurityAuditLog.create({
      data: {
        userId: ctx.user.id,
        type: UserSecurityAuditLogType.AUDIT_LOG_EXPORTED,
        ipAddress: ctx.metadata.requestMetadata.ipAddress,
        userAgent: ctx.metadata.requestMetadata.userAgent,
      },
    });

    return {
      data,
      filename: getExportFilename(exportedAt, format),
      mimeType: format === 'CSV' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8',
      exportedAt,
      counts,
    };
  });
