import { BullModule } from '@nestjs/bullmq';
import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AI_QUEUE, DIGEST_QUEUE, EMAIL_QUEUE } from './queue.constants';
import { QUEUE_ENABLED } from './queue-enabled.token';

function isQueueEnabledFromEnv(): boolean {
  return String(process.env.QUEUE_ENABLED ?? 'false').toLowerCase() === 'true';
}

@Global()
@Module({})
export class QueueModule {
  static forRoot(): DynamicModule {
    const enabled = isQueueEnabledFromEnv();

    if (!enabled) {
      return {
        module: QueueModule,
        providers: [{ provide: QUEUE_ENABLED, useValue: false }],
        exports: [QUEUE_ENABLED],
      };
    }

    return {
      module: QueueModule,
      imports: [
        ConfigModule,
        BullModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (configService: ConfigService) => ({
            connection: {
              // family: 0 = dual-stack (required for Railway private Redis / IPv6)
              family: 0,
              host: configService.get<string>('REDIS_HOST', '127.0.0.1'),
              port: Number(configService.get<string>('REDIS_PORT', '6379')),
              password: configService.get<string>('REDIS_PASSWORD') || undefined,
              maxRetriesPerRequest: null,
            },
            defaultJobOptions: {
              removeOnComplete: 100,
              removeOnFail: 200,
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 2000,
              },
            },
          }),
        }),
        BullModule.registerQueue(
          { name: AI_QUEUE },
          { name: EMAIL_QUEUE },
          { name: DIGEST_QUEUE },
        ),
      ],
      providers: [{ provide: QUEUE_ENABLED, useValue: true }],
      exports: [BullModule, QUEUE_ENABLED],
    };
  }
}
