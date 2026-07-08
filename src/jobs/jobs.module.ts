import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { ActivityEvent } from '../entities/activity-event.entity';
import { Organization } from '../entities/organization.entity';
import { Task } from '../entities/task.entity';
import { User } from '../entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationDigestJob } from './notification-digest.job';
import { NotificationDigestService } from './notification-digest.service';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    EmailModule,
    NotificationsModule,
    TypeOrmModule.forFeature([Organization, User, Task, ActivityEvent]),
  ],
  providers: [NotificationDigestService, NotificationDigestJob],
})
export class JobsModule {}
