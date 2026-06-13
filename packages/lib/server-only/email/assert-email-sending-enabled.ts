import { AppError } from '../../errors/app-error';

export const EMAILS_DISABLED_ERROR_CODE = 'EMAILS_DISABLED';

export const assertEmailSendingEnabled = (emailsDisabled: boolean) => {
  if (!emailsDisabled) {
    return;
  }

  throw new AppError(EMAILS_DISABLED_ERROR_CODE, {
    message: 'Email sending is disabled for this organisation.',
    userMessage: 'Email sending is disabled for this organisation.',
    statusCode: 403,
  });
};
