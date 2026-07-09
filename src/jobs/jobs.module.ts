import { getQueueToken } from '@nestjs/bullmq';
import { Module, Provider } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { ActivityEvent } from '../entities/activity-event.entity';
import { Organization } from '../entities/organization.entity';
import { Task } from '../entities/task.entity';
import { User } from '../entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { QUEUE_ENABLED } from '../queues/queue-enabled.token';
import { DIGEST_QUEUE } from '../queues/queue.constants';
import { DigestQueueService } from '../queues/digest-queue.service';
import { DigestQueueProcessor } from '../queues/processors/digest.processor';
import { NotificationDigestJob } from './notification-digest.job';
import { NotificationDigestService } from './notification-digest.service';

const queueEnabled =
  String(process.env.QUEUE_ENABLED ?? 'false').toLowerCase() === 'true';

const digestQueueProviders: Provider[] = queueEnabled
  ? [
      {
        provide: DigestQueueService,
        inject: [QUEUE_ENABLED, getQueueToken(DIGEST_QUEUE)],
        useFactory: (
          enabled: boolean,
          queue: ConstructorParameters<typeof DigestQueueService>[1],
        ) => new DigestQueueService(enabled, queue),
      },
      DigestQueueProcessor,
    ]
  : [
      {
        provide: DigestQueueService,
        useFactory: () => new DigestQueueService(false),
      },
    ];

@Module({
  imports: [
    ScheduleModule.forRoot(),
    EmailModule,
    NotificationsModule,
    TypeOrmModule.forFeature([Organization, User, Task, ActivityEvent]),
  ],
  providers: [
    NotificationDigestService,
    NotificationDigestJob,
    ...digestQueueProviders,
  ],
  exports: [NotificationDigestService],
})
export class JobsModule {}
