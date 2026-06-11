import { prisma } from '@documenso/prisma';
import { DocumentStatus, FieldType, RecipientRole, SigningStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DOCUMENT_AUDIT_LOG_TYPE } from '../../types/document-audit-logs';
import { validateFieldAuth } from '../document/validate-field-auth';
import { signFieldWithToken } from './sign-field-with-token';

const mocks = vi.hoisted(() => ({
  createDocumentAuditLogData: vi.fn((data: unknown) => data),
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    documentMeta: {
      findFirst: vi.fn(),
    },
    field: {
      findFirstOrThrow: vi.fn(),
    },
    recipient: {
      findFirstOrThrow: vi.fn(),
    },
  },
}));

vi.mock('@prisma/client', () => ({
  DocumentSource: {
    DOCUMENT: 'DOCUMENT',
    TEMPLATE: 'TEMPLATE',
    TEMPLATE_DIRECT_LINK: 'TEMPLATE_DIRECT_LINK',
  },
  DocumentStatus: {
    PENDING: 'PENDING',
  },
  FieldType: {
    CHECKBOX: 'CHECKBOX',
    DATE: 'DATE',
    DROPDOWN: 'DROPDOWN',
    EMAIL: 'EMAIL',
    FREE_SIGNATURE: 'FREE_SIGNATURE',
    INITIALS: 'INITIALS',
    NAME: 'NAME',
    NUMBER: 'NUMBER',
    RADIO: 'RADIO',
    SIGNATURE: 'SIGNATURE',
    TEXT: 'TEXT',
  },
  RecipientRole: {
    ASSISTANT: 'ASSISTANT',
    SIGNER: 'SIGNER',
  },
  SigningStatus: {
    NOT_SIGNED: 'NOT_SIGNED',
    SIGNED: 'SIGNED',
  },
}));

vi.mock('../../utils/document-audit-logs', () => ({
  createDocumentAuditLogData: mocks.createDocumentAuditLogData,
}));

vi.mock('../document/validate-field-auth', () => ({
  validateFieldAuth: vi.fn(),
}));

const recipientFindFirstOrThrowMock = vi.mocked(prisma.recipient.findFirstOrThrow);
const fieldFindFirstOrThrowMock = vi.mocked(prisma.field.findFirstOrThrow);
const documentMetaFindFirstMock = vi.mocked(prisma.documentMeta.findFirst);
const transactionMock = vi.mocked(prisma.$transaction);
const validateFieldAuthMock = vi.mocked(validateFieldAuth);

const assistantRecipient = {
  id: 1,
  email: 'assistant@example.com',
  envelopeId: 'envelope-1',
  expiresAt: null,
  name: 'Assistant',
  role: RecipientRole.ASSISTANT,
  signingOrder: 1,
  signingStatus: SigningStatus.NOT_SIGNED,
  token: 'assistant-token',
};

const signerRecipient = {
  id: 2,
  email: 'signer@example.com',
  envelopeId: 'envelope-1',
  expiresAt: null,
  name: 'Signer',
  role: RecipientRole.SIGNER,
  signingOrder: 2,
  signingStatus: SigningStatus.NOT_SIGNED,
  token: 'signer-token',
};

const envelope = {
  id: 'envelope-1',
  authOptions: null,
  deletedAt: null,
  recipients: [assistantRecipient, signerRecipient],
  status: DocumentStatus.PENDING,
};

const createField = (recipient = signerRecipient) => ({
  id: 99,
  customText: '',
  envelope,
  fieldMeta: null,
  inserted: false,
  recipient,
  recipientId: recipient.id,
  secondaryId: 'field-secondary-id',
  type: FieldType.TEXT,
});

const createTransaction = (updatedField = { ...createField(), customText: 'Signed value', inserted: true }) => {
  const tx = {
    documentAuditLog: {
      create: vi.fn(),
    },
    field: {
      update: vi.fn().mockResolvedValue(updatedField),
    },
    signature: {
      upsert: vi.fn(),
    },
  };

  transactionMock.mockImplementation(async (callback) => callback(tx));

  return tx;
};

describe('signFieldWithToken', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    validateFieldAuthMock.mockResolvedValue(undefined);
    documentMetaFindFirstMock.mockResolvedValue(null);
  });

  it('should allow assistants to sign pending fields for same-envelope recipients', async () => {
    const field = createField(signerRecipient);
    const tx = createTransaction({ ...field, customText: 'Prefilled value', inserted: true });

    recipientFindFirstOrThrowMock.mockResolvedValue(assistantRecipient);
    fieldFindFirstOrThrowMock.mockResolvedValue(field);

    const result = await signFieldWithToken({
      token: 'assistant-token',
      fieldId: field.id,
      value: 'Prefilled value',
      requestMetadata: { userAgent: 'vitest' },
    });

    expect(fieldFindFirstOrThrowMock).toHaveBeenCalledWith({
      where: {
        id: field.id,
        recipient: {
          signingStatus: {
            not: SigningStatus.SIGNED,
          },
          signingOrder: {
            gte: assistantRecipient.signingOrder,
          },
          envelopeId: assistantRecipient.envelopeId,
        },
      },
      include: {
        envelope: {
          include: {
            recipients: true,
          },
        },
        recipient: true,
      },
    });
    expect(tx.field.update).toHaveBeenCalledWith({
      where: {
        id: field.id,
      },
      data: {
        customText: 'Prefilled value',
        inserted: true,
      },
    });
    expect(tx.documentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_FIELD_PREFILLED,
        envelopeId: envelope.id,
        user: {
          email: assistantRecipient.email,
          name: assistantRecipient.name,
        },
      }),
    });
    expect(result).toMatchObject({
      customText: 'Prefilled value',
      inserted: true,
    });
  });

  it('should scope non-assistant field signing to the recipient token owner', async () => {
    const field = createField(signerRecipient);
    const tx = createTransaction({ ...field, customText: 'Signed value', inserted: true });

    recipientFindFirstOrThrowMock.mockResolvedValue(signerRecipient);
    fieldFindFirstOrThrowMock.mockResolvedValue(field);

    await signFieldWithToken({
      token: 'signer-token',
      fieldId: field.id,
      value: 'Signed value',
    });

    expect(fieldFindFirstOrThrowMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: field.id,
          recipient: {
            id: signerRecipient.id,
          },
        },
      }),
    );
    expect(tx.documentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_FIELD_INSERTED,
        user: {
          email: signerRecipient.email,
          name: signerRecipient.name,
        },
      }),
    });
  });

  it('should use an inserted audit log when an assistant signs their own field', async () => {
    const field = createField(assistantRecipient);
    const tx = createTransaction({ ...field, customText: 'Assistant value', inserted: true });

    recipientFindFirstOrThrowMock.mockResolvedValue(assistantRecipient);
    fieldFindFirstOrThrowMock.mockResolvedValue(field);

    await signFieldWithToken({
      token: 'assistant-token',
      fieldId: field.id,
      value: 'Assistant value',
    });

    expect(tx.documentAuditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: DOCUMENT_AUDIT_LOG_TYPE.DOCUMENT_FIELD_INSERTED,
        user: {
          email: assistantRecipient.email,
          name: assistantRecipient.name,
        },
      }),
    });
  });
});
