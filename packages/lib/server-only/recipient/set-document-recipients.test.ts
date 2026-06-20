import { RecipientRole, SendStatus, SigningStatus } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';

import { AppErrorCode } from '../../errors/app-error';
import { setDocumentRecipients } from './set-document-recipients';

const mocks = vi.hoisted(() => ({
  getEmailContext: vi.fn(),
  getEnvelopeWhereInput: vi.fn(),
  prisma: {
    $transaction: vi.fn(),
    envelope: {
      findFirst: vi.fn(),
    },
    user: {
      findFirstOrThrow: vi.fn(),
    },
  },
}));

vi.mock('@documenso/prisma', () => ({
  prisma: mocks.prisma,
}));

vi.mock('../email/get-email-context', () => ({
  getEmailContext: mocks.getEmailContext,
}));

vi.mock('../envelope/get-envelope-by-id', () => ({
  getEnvelopeWhereInput: mocks.getEnvelopeWhereInput,
}));

vi.mock('../../client-only/providers/i18n-server', () => ({
  getI18nInstance: vi.fn().mockResolvedValue({
    _: vi.fn((message) => message),
  }),
}));

vi.mock('../../utils/render-email-with-i18n', () => ({
  renderEmailWithI18N: vi.fn(),
}));

const createRecipient = (signingStatus: SigningStatus) => ({
  id: 1,
  clientId: null,
  email: 'recipient@example.com',
  name: 'Recipient',
  role: RecipientRole.SIGNER,
  signingOrder: null,
  signingStatus,
  sendStatus: SendStatus.SENT,
  authOptions: {
    accessAuth: [],
    actionAuth: [],
  },
});

const createEnvelope = (signingStatus: SigningStatus) => ({
  id: 'envelope-1',
  secondaryId: 'secondary-1',
  title: 'Test Document',
  completedAt: null,
  fields: [],
  documentMeta: null,
  team: {
    organisation: {
      organisationClaim: {
        flags: {
          cfr21: false,
        },
      },
    },
  },
  recipients: [createRecipient(signingStatus)],
});

describe('setDocumentRecipients', () => {
  it('prevents removing a recipient who has rejected the document', async () => {
    mocks.getEnvelopeWhereInput.mockResolvedValue({
      envelopeWhereInput: {
        id: 'envelope-1',
      },
    });

    mocks.prisma.envelope.findFirst.mockResolvedValue(createEnvelope(SigningStatus.REJECTED));
    mocks.prisma.user.findFirstOrThrow.mockResolvedValue({
      id: 1,
      name: 'Owner',
      email: 'owner@example.com',
    });
    mocks.getEmailContext.mockResolvedValue({
      branding: {},
      emailLanguage: 'en',
      senderEmail: {
        name: 'Documenso',
        address: 'noreply@example.com',
      },
      replyToEmail: undefined,
      organisationId: 'org-1',
      claims: {},
      emailsDisabled: false,
      emailTransport: {
        sendMail: vi.fn(),
      },
    });

    await expect(
      setDocumentRecipients({
        userId: 1,
        teamId: 1,
        id: {
          type: 'documentId',
          id: 1,
        },
        recipients: [],
        requestMetadata: {},
      }),
    ).rejects.toMatchObject({
      code: AppErrorCode.INVALID_REQUEST,
    });

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
