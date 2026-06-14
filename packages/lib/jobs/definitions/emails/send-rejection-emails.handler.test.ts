import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaEnums = vi.hoisted(() => ({
  DocumentDistributionMethod: {
    NONE: 'NONE',
  },
  SendStatus: {
    SENT: 'SENT',
  },
  SigningStatus: {
    REJECTED: 'REJECTED',
  },
}));

const mocks = vi.hoisted(() => ({
  emailTransportSendMail: vi.fn(),
  envelopeFindFirstOrThrow: vi.fn(),
  getEmailContext: vi.fn(),
  getI18nInstance: vi.fn(),
  isRecipientEmailValidForSending: vi.fn(),
  mailerSendMail: vi.fn(),
  recipientFindFirstOrThrow: vi.fn(),
  recipientUpdate: vi.fn(),
  renderEmailWithI18N: vi.fn(),
}));

vi.mock('@documenso/email/mailer', () => ({
  mailer: {
    sendMail: mocks.mailerSendMail,
  },
}));

vi.mock('@documenso/email/templates/document-rejected', () => ({
  default: () => null,
}));

vi.mock('@documenso/email/templates/document-rejection-confirmed', () => ({
  default: () => null,
}));

vi.mock('@documenso/lib/utils/recipients', () => ({
  isRecipientEmailValidForSending: mocks.isRecipientEmailValidForSending,
}));

vi.mock('@documenso/prisma', () => ({
  prisma: {
    envelope: {
      findFirstOrThrow: mocks.envelopeFindFirstOrThrow,
    },
    recipient: {
      findFirstOrThrow: mocks.recipientFindFirstOrThrow,
      update: mocks.recipientUpdate,
    },
  },
}));

vi.mock('@prisma/client', () => ({
  DocumentDistributionMethod: prismaEnums.DocumentDistributionMethod,
  EnvelopeType: {
    DOCUMENT: 'DOCUMENT',
  },
  SendStatus: prismaEnums.SendStatus,
  SigningStatus: prismaEnums.SigningStatus,
}));

vi.mock('@lingui/core/macro', () => ({
  msg: (strings: TemplateStringsArray, ...values: unknown[]) =>
    strings.reduce((result, string, index) => `${result}${string}${values[index] ?? ''}`, ''),
}));

vi.mock('../../../client-only/providers/i18n-server', () => ({
  getI18nInstance: mocks.getI18nInstance,
}));

vi.mock('../../../server-only/email/get-email-context', () => ({
  getEmailContext: mocks.getEmailContext,
}));

vi.mock('../../../utils/render-email-with-i18n', () => ({
  renderEmailWithI18N: mocks.renderEmailWithI18N,
}));

vi.mock('../../../utils/teams', () => ({
  formatDocumentsPath: (teamUrl?: string | null) => (teamUrl ? `/t/${teamUrl}/documents` : '/documents'),
}));

import { run } from './send-rejection-emails.handler';

describe('send-rejection-emails.handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.envelopeFindFirstOrThrow.mockResolvedValue({
      id: 'envelope-1',
      title: 'Link only document',
      teamId: 1,
      documentMeta: {
        distributionMethod: prismaEnums.DocumentDistributionMethod.NONE,
        emailSettings: {},
      },
      user: {
        id: 1,
        email: 'owner@example.com',
        name: 'Owner',
      },
      team: {
        teamEmail: null,
        name: 'Team',
        url: 'team',
      },
    });

    mocks.recipientFindFirstOrThrow.mockResolvedValue({
      id: 2,
      email: 'recipient@example.com',
      name: 'Recipient',
      signingStatus: prismaEnums.SigningStatus.REJECTED,
      rejectionReason: 'Not approved',
    });

    mocks.getEmailContext.mockResolvedValue({
      branding: {},
      emailLanguage: 'en',
      senderEmail: {
        name: 'Documenso',
        address: 'noreply@example.com',
      },
      replyToEmail: undefined,
      emailsDisabled: false,
      emailTransport: {
        sendMail: mocks.emailTransportSendMail,
      },
    });

    mocks.getI18nInstance.mockResolvedValue({
      _: (message: string) => message,
    });

    mocks.isRecipientEmailValidForSending.mockReturnValue(true);
    mocks.renderEmailWithI18N.mockResolvedValue('rendered-email');
  });

  it('still notifies the owner when link-only distribution suppresses recipient emails', async () => {
    const runTask = vi.fn(async (_name: string, task: () => Promise<void>) => task());
    const io = {
      runTask,
    } as unknown as Parameters<typeof run>[0]['io'];

    await run({
      payload: {
        documentId: 1,
        recipientId: 2,
      },
      io,
    });

    const taskNames = runTask.mock.calls.map(([name]) => name);

    expect(taskNames).not.toContain('send-rejection-confirmation-email');
    expect(taskNames).toContain('send-owner-notification-email');
    expect(mocks.emailTransportSendMail).not.toHaveBeenCalled();
    expect(mocks.mailerSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: {
          name: 'Owner',
          address: 'owner@example.com',
        },
      }),
    );
    expect(mocks.recipientUpdate).toHaveBeenCalledWith({
      where: {
        id: 2,
      },
      data: {
        sendStatus: prismaEnums.SendStatus.SENT,
      },
    });
  });
});
