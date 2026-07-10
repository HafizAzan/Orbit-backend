import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type SentryModule = {
  init: (options: Record<string, unknown>) => void;
  captureException: (error: unknown) => void;
  setupNestErrorHandler?: (app: INestApplication) => void;
};

let sentry: SentryModule | null = null;

export async function initSentry(configService: ConfigService) {
  const dsn = configService.get<string>('SENTRY_DSN');
  if (!dsn) {
    return null;
  }

  try {
    // Optional dependency — only loads when DSN is configured.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    sentry = require('@sentry/node') as SentryModule;
  } catch {
    console.warn(
      'SENTRY_DSN is set but @sentry/node is not installed. Skipping Sentry init.',
    );
    return null;
  }

  sentry.init({
    dsn,
    environment: configService.get<string>('NODE_ENV', 'development'),
    tracesSampleRate: Number(
      configService.get<string>('SENTRY_TRACES_SAMPLE_RATE') ?? 0.1,
    ),
  });

  return sentry;
}

export function captureException(error: unknown) {
  sentry?.captureException(error);
}
