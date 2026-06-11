import { PDF_SIZE_A4_72PPI } from '@documenso/lib/constants/pdf';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { generateAuditLogPdf } from '@documenso/lib/server-only/pdf/generate-audit-log-pdf';
import { DOCUMENT_AUDIT_LOG_TYPE } from '@documenso/lib/types/document-audit-logs';
import { createDocumentAuditLogData } from '@documenso/lib/utils/document-audit-logs';
import { unsafeBuildEnvelopeIdQuery } from '@documenso/lib/utils/envelope';
import { prisma } from '@documenso/prisma';
import { EnvelopeType } from '@prisma/client';

import { adminProcedure } from '../trpc';
import {
  ZAdminDownloadDocumentAuditLogsRequestSchema,
  ZAdminDownloadDocumentAuditLogsResponseSchema,
} from './download-document-audit-logs.types';

export const downloadDocumentAuditLogsRoute = adminProcedure
  .input(ZAdminDownloadDocumentAuditLogsRequestSchema)
  .output(ZAdminDownloadDocumentAuditLogsResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { envelopeId } = input;

    ctx.logger.info({
      input: {
        envelopeId,
      },
    });

    const envelope = await prisma.envelope.findFirst({
      where: unsafeBuildEnvelopeIdQuery(
        {
          type: 'envelopeId',
          id: envelopeId,
        },
        EnvelopeType.DOCUMENT,
      ),
      include: {
        documentMeta: true,
        envelopeItems: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        recipients: {
          orderBy: {
            id: 'asc',
          },
        },
        fields: true,
      },
    });

    if (!envelope) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: 'Envelope not found',
      });
    }

    const auditLogPdf = await generateAuditLogPdf({
      envelope,
      recipients: envelope.recipients,
      fields: envelope.fields,
      language: envelope.documentMeta.language,
      envelopeOwner: {
        email: envelope.user.email,
        name: envelope.user.name || '',
      },
      envelopeItems: envelope.envelopeItems.map((item) => item.title),
      pageWidth: PDF_SIZE_A4_72PPI.width,
      pageHeight: PDF_SIZE_A4_72PPI.height,
    });

    const result = await auditLogPdf.save();

    const base64 = Buffer.from(result).toString('base64');

    await prisma.documentAuditLog.create({
      data: createDocumentAuditLogData({
        envelopeId: envelope.id,
        type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_AUDIT_LOG_EXPORTED,
        data: {
          format: 'PDF',
        },
        user: ctx.user,
        metadata: ctx.metadata,
      }),
    });

    return {
      data: base64,
      envelopeTitle: envelope.title,
    };
  });
