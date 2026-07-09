export const AI_QUEUE = 'ai';
export const EMAIL_QUEUE = 'email';
export const DIGEST_QUEUE = 'digest';

export const AI_JOB_GENERATE_TEXT = 'generate-text';

export const EMAIL_JOB_SEND = 'send-email';

export const DIGEST_JOB_DAILY = 'daily-digest';
export const DIGEST_JOB_WEEKLY = 'weekly-report';

export type AiGenerateTextJobData = {
  prompt: string;
};

export type AiGenerateTextJobResult = {
  text: string;
};

export type EmailSendJobData = {
  to: string;
  subject: string;
  html: string;
  failureMessage: string;
};

export type DigestJobData = Record<string, never>;
