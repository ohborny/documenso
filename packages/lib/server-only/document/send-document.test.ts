import {
  DocumentDistributionMethod,
  DocumentSigningOrder,
  DocumentStatus,
  DocumentVisibility,
  EnvelopeType,
  ReadStatus,
  RecipientRole,
  SendStatus,
  SigningStatus,
} from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppError } from '../../errors/app-error';
import { EMAILS_DISABLED_ERROR_CODE } from '../email/assert-email-sending-enabled';

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
    envelope: {
      findFirst: vi.fn(),
      findFirstOrThrow: vi.fn(),
    },
  },
  jobs: {
    triggerJob: vi.fn(),
  },
  getEmailContext: vi.fn(),
  getEnvelopeWhereInput: vi.fn(),
  assertUserNotDisabledById: vi.fn(),
  triggerWebhook: vi.fn(),
  mapEnvelopeToWebhookDocumentPayload: vi.fn(),
  parseWebhookDocument: vi.fn(),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: mocks.prisma,
}));

vi.mock('../../jobs/client', () => ({
  jobs: mocks.jobs,
}));

vi.mock('../../types/webhook-payload', () => ({
  mapEnvelopeToWebhookDocumentPayload: mocks.mapEnvelopeToWebhookDocumentPayload,
  ZWebhookDocumentSchema: {
    parse: mocks.parseWebhookDocument,
  },
}));

vi.mock('../email/get-email-context', () => ({
  getEmailContext: mocks.getEmailContext,
}));

vi.mock('../envelope/get-envelope-by-id', () => ({
  getEnvelopeWhereInput: mocks.getEnvelopeWhereInput,
}));

vi.mock('../user/assert-user-not-disabled', () => ({
  assertUserNotDisabledById: mocks.assertUserNotDisabledById,
}));

vi.mock('../webhooks/trigger/trigger-webhook', () => ({
  triggerWebhook: mocks.triggerWebhook,
}));

const { sendDocument } = await import('./send-document');

const baseRecipient = {
  id: 10,
  email: 'recipient@example.com',
  name: 'Recipient',
  token: 'recipient-token',
  role: RecipientRole.VIEWER,
  signingOrder: null,
  signingStatus: SigningStatus.NOT_SIGNED,
  sendStatus: SendStatus.NOT_SENT,
  readStatus: ReadStatus.NOT_OPENED,
  signedAt: null,
  documentDeletedAt: null,
  expiresAt: null,
  expirationNotifiedAt: null,
  rejectionReason: null,
  authOptions: null,
};

const baseDocumentMeta = {
  id: 'document_meta_1',
  subject: null,
  message: null,
  timezone: 'Etc/UTC',
  dateFormat: 'yyyy-MM-dd hh:mm a',
  redirectUrl: null,
  signingOrder: DocumentSigningOrder.PARALLEL,
  allowDictateNextSigner: false,
  typedSignatureEnabled: true,
  uploadSignatureEnabled: true,
  drawSignatureEnabled: true,
  language: 'en',
  distributionMethod: DocumentDistributionMethod.EMAIL,
  emailSettings: null,
  emailId: null,
  emailReplyTo: null,
  envelopeExpirationPeriod: null,
};

const baseEnvelope = {
  id: 'envelope_test',
  secondaryId: 'document_1',
  externalId: null,
  userId: 1,
  teamId: 2,
  templateId: null,
  title: 'Test document',
  type: EnvelopeType.DOCUMENT,
  status: DocumentStatus.DRAFT,
  visibility: DocumentVisibility.EVERYONE,
  source: 'DOCUMENT',
  authOptions: null,
  formValues: null,
  internalVersion: 1,
  completedAt: null,
  deletedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  recipients: [baseRecipient],
  fields: [],
  documentMeta: baseDocumentMeta,
  envelopeItems: [{ id: 'envelope_item_1', documentData: {} }],
  team: {
    organisation: {
      organisationClaim: {
        recipientCount: 0,
      },
    },
  },
};

const baseOptions = {
  id: {
    type: 'envelopeId' as const,
    id: baseEnvelope.id,
  },
  userId: 1,
  teamId: 2,
  requestMetadata: {
    source: 'app' as const,
    auth: 'session' as const,
    requestMetadata: {},
  },
};

describe('sendDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getEnvelopeWhereInput.mockResolvedValue({
      envelopeWhereInput: { id: baseEnvelope.id },
    });

    mocks.prisma.envelope.findFirst.mockResolvedValue(baseEnvelope);
    mocks.getEmailContext.mockResolvedValue({ emailsDisabled: false });
    mocks.mapEnvelopeToWebhookDocumentPayload.mockReturnValue({});
    mocks.parseWebhookDocument.mockReturnValue({});
  });

  it('fails before mutating a document when signing emails are disabled for the organisation', async () => {
    mocks.getEmailContext.mockResolvedValue({ emailsDisabled: true });

    await expect(sendDocument(baseOptions)).rejects.toMatchObject({
      code: EMAILS_DISABLED_ERROR_CODE,
    } satisfies Partial<AppError>);

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
    expect(mocks.jobs.triggerJob).not.toHaveBeenCalled();
    expect(mocks.triggerWebhook).not.toHaveBeenCalled();
  });

  it('allows manual link distribution while organisation email sending is disabled', async () => {
    const manualEnvelope = {
      ...baseEnvelope,
      documentMeta: {
        ...baseDocumentMeta,
        distributionMethod: DocumentDistributionMethod.NONE,
      },
    };

    mocks.prisma.envelope.findFirst.mockResolvedValue(manualEnvelope);
    mocks.getEmailContext.mockResolvedValue({ emailsDisabled: true });
    mocks.prisma.$transaction.mockImplementation(async (callback) => {
      const tx = {
        documentAuditLog: {
          create: vi.fn(),
        },
        envelope: {
          update: vi.fn().mockResolvedValue({
            ...manualEnvelope,
            status: DocumentStatus.PENDING,
          }),
        },
        field: {
          update: vi.fn(),
        },
        recipient: {
          updateMany: vi.fn(),
        },
      };

      return await callback(tx);
    });

    await expect(
      sendDocument({
        ...baseOptions,
        sendEmail: false,
      }),
    ).resolves.toMatchObject({
      status: DocumentStatus.PENDING,
    });

    expect(mocks.getEmailContext).not.toHaveBeenCalled();
    expect(mocks.jobs.triggerJob).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'send.signing.requested.email' }),
    );
    expect(mocks.triggerWebhook).toHaveBeenCalledOnce();
  });
});
