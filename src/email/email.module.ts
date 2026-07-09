import { getQueueToken } from '@nestjs/bullmq';
import { Module, Provider } from '@nestjs/common';
import { QUEUE_ENABLED } from '../queues/queue-enabled.token';
import { EMAIL_QUEUE } from '../queues/queue.constants';
import { EmailQueueService } from '../queues/email-queue.service';
import { EmailQueueProcessor } from '../queues/processors/email.processor';
import { EmailService } from './email.service';

const queueEnabled =
  String(process.env.QUEUE_ENABLED ?? 'false').toLowerCase() === 'true';

const emailQueueProviders: Provider[] = queueEnabled
  ? [
      {
        provide: EmailQueueService,
        inject: [QUEUE_ENABLED, getQueueToken(EMAIL_QUEUE)],
        useFactory: (
          enabled: boolean,
          queue: ConstructorParameters<typeof EmailQueueService>[1],
        ) => new EmailQueueService(enabled, queue),
      },
      EmailQueueProcessor,
    ]
  : [
      {
        provide: EmailQueueService,
        useFactory: () => new EmailQueueService(false),
      },
    ];

@Module({
  providers: [EmailService, ...emailQueueProviders],
  exports: [EmailService],
})
export class EmailModule {}
