import { AppError, AppErrorCode } from '../../errors/app-error';

export const assertEmailSendingEnabled = (emailsDisabled: boolean) => {
  if (!emailsDisabled) {
    return;
  }

  throw new AppError(AppErrorCode.ORGANISATION_EMAILS_DISABLED, {
    message: 'Email sending is disabled for this organisation.',
    userMessage: 'Email sending is disabled for this organisation.',
    statusCode: 403,
  });
};
