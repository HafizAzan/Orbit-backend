import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { OrganizationGuardsModule } from '../auth/organization-guards.module';
import { Notification } from '../entities/notification.entity';
import { Subscription } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';
import { PresenceService } from '../realtime/presence.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { RealtimeService } from '../realtime/realtime.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, Subscription, User]),
    forwardRef(() => AuthModule),
    OrganizationGuardsModule,
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
