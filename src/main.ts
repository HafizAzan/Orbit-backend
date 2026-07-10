import './load-env';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { IoAdapter } from '@nestjs/platform-socket.io';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { initSentry } from './common/sentry';
import { TASK_UPLOADS_ROOT } from './tasks/task-attachment.storage';

function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  const configService = app.get(ConfigService);
  await initSentry(configService);
  const port = configService.get<number>('PORT', 5000);
  const corsOrigins = parseCorsOrigins(
    configService.get<string>('CORS_ORIGIN', ''),
  );
  const isProduction = configService.get<string>('NODE_ENV') === 'production';

  if (isProduction) {
    app.set('trust proxy', 1);
  }

  app.useWebSocketAdapter(new IoAdapter(app));

  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { extended: true, limit: '100kb' });

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
      disableErrorMessages: isProduction,
    }),
  );

  app.setGlobalPrefix('api/v1');

  app.useStaticAssets(TASK_UPLOADS_ROOT, {
    prefix: '/api/v1/uploads/',
  });

  app.enableShutdownHooks();

  await app.listen(port);
}

bootstrap();
