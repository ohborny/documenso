import { prisma } from '@documenso/prisma';
import { FieldType } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type AppError, AppErrorCode } from '../../errors/app-error';
import { getRecipientsForAssistant } from './get-recipients-for-assistant';

vi.mock('@documenso/prisma', () => ({
  prisma: {
    recipient: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

const recipientFindFirstMock = vi.mocked(prisma.recipient.findFirst);
const recipientFindManyMock = vi.mocked(prisma.recipient.findMany);

describe('getRecipientsForAssistant', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('should throw when the assistant token does not resolve to a recipient', async () => {
    recipientFindFirstMock.mockResolvedValue(null);

    await expect(getRecipientsForAssistant({ token: 'missing-token' })).rejects.toMatchObject({
      code: AppErrorCode.NOT_FOUND,
      message: 'Assistant not found',
    } satisfies Partial<AppError>);

    expect(recipientFindManyMock).not.toHaveBeenCalled();
  });

  it('should return recipients available to the assistant and redact other tokens', async () => {
    recipientFindFirstMock.mockResolvedValue({
      id: 10,
      envelopeId: 'envelope-1',
      signingOrder: 2,
      token: 'assistant-token',
    });

    recipientFindManyMock.mockResolvedValue([
      {
        id: 10,
        envelopeId: 'envelope-1',
        signingOrder: 2,
        token: 'assistant-token',
      },
      {
        id: 11,
        envelopeId: 'envelope-1',
        signingOrder: 3,
        token: 'signer-token',
      },
    ]);

    const recipients = await getRecipientsForAssistant({ token: 'assistant-token' });

    expect(recipientFindManyMock).toHaveBeenCalledWith({
      where: {
        envelopeId: 'envelope-1',
        signingOrder: {
          gte: 2,
        },
      },
      include: {
        fields: {
          where: {
            OR: [
              {
                recipientId: 10,
              },
              {
                type: {
                  not: FieldType.SIGNATURE,
                },
                envelopeId: 'envelope-1',
              },
            ],
          },
        },
      },
    });

    expect(recipients).toEqual([
      {
        id: 10,
        envelopeId: 'envelope-1',
        signingOrder: 2,
        token: 'assistant-token',
      },
      {
        id: 11,
        envelopeId: 'envelope-1',
        signingOrder: 3,
        token: '',
      },
    ]);
  });

  it('should treat assistants without a signing order as starting at zero', async () => {
    recipientFindFirstMock.mockResolvedValue({
      id: 12,
      envelopeId: 'envelope-2',
      signingOrder: null,
      token: 'assistant-token',
    });
    recipientFindManyMock.mockResolvedValue([]);

    await getRecipientsForAssistant({ token: 'assistant-token' });

    expect(recipientFindManyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          envelopeId: 'envelope-2',
          signingOrder: {
            gte: 0,
          },
        },
      }),
    );
  });
});
