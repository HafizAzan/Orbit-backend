import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Notification } from '../entities/notification.entity';
import { User } from '../entities/user.entity';
import { PresenceService } from '../realtime/presence.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User]),
    forwardRef(() => AuthModule),
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    RealtimeGateway,
    RealtimeService,
    PresenceService,
  ],
  exports: [NotificationsService, RealtimeService, PresenceService],
})
export class NotificationsModule {}
