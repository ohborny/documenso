import { ReadStatus, RecipientRole, SendStatus, SigningStatus } from '@prisma/client';
import { describe, expect, it } from 'vitest';

import type { TRecipientLite } from '../types/recipient';
import { canRecipientBeModified } from './recipients';

const createRecipient = (signingStatus: SigningStatus): TRecipientLite =>
  ({
    id: 1,
    role: RecipientRole.SIGNER,
    signingStatus,
    sendStatus: SendStatus.SENT,
    envelopeId: 'envelope-1',
    readStatus: ReadStatus.NOT_OPENED,
    email: 'recipient@example.com',
    name: 'Recipient',
    token: 'token',
    documentDeletedAt: null,
    expired: null,
    expiresAt: null,
    expirationNotifiedAt: null,
    signedAt: null,
    authOptions: {
      accessAuth: [],
      actionAuth: [],
    },
    signingOrder: null,
    rejectionReason: null,
  }) as TRecipientLite;

describe('canRecipientBeModified', () => {
  it('allows recipients who have not interacted with the document', () => {
    expect(canRecipientBeModified(createRecipient(SigningStatus.NOT_SIGNED), [])).toBe(true);
  });

  it('prevents modifying recipients who have signed the document', () => {
    expect(canRecipientBeModified(createRecipient(SigningStatus.SIGNED), [])).toBe(false);
  });

  it('prevents modifying recipients who have rejected the document', () => {
    expect(canRecipientBeModified(createRecipient(SigningStatus.REJECTED), [])).toBe(false);
  });

  it('prevents modifying recipients who have inserted fields', () => {
    expect(
      canRecipientBeModified(createRecipient(SigningStatus.NOT_SIGNED), [
        {
          recipientId: 1,
          inserted: true,
        },
      ]),
    ).toBe(false);
  });
});
