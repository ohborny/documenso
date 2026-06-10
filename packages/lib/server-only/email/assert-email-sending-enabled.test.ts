import { describe, expect, it } from 'vitest';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { assertEmailSendingEnabled } from './assert-email-sending-enabled';

describe('assertEmailSendingEnabled', () => {
  it('throws a forbidden AppError when organisation emails are disabled', () => {
    expect(() => assertEmailSendingEnabled(true)).toThrow(AppError);

    try {
      assertEmailSendingEnabled(true);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect(error).toMatchObject({
        code: AppErrorCode.ORGANISATION_EMAILS_DISABLED,
        statusCode: 403,
        userMessage: 'Email sending is disabled for this organisation.',
      });
    }
  });

  it('allows email sending when organisation emails are enabled', () => {
    expect(() => assertEmailSendingEnabled(false)).not.toThrow();
  });
});
