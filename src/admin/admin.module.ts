import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ActivityEvent } from '../entities/activity-event.entity';
import { Organization } from '../entities/organization.entity';
import { PlatformSettings } from '../entities/platform-settings.entity';
import { Subscription } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';
import { AdminActivityController } from './admin-activity.controller';
import { AdminActivityService } from './admin-activity.service';
import { AdminDashboardController } from './admin-dashboard.controller';
import { AdminDashboardService } from './admin-dashboard.service';
import { AdminSettingsController } from './admin-settings.controller';
import { AdminSettingsService } from './admin-settings.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Organization,
      User,
      Subscription,
      ActivityEvent,
      PlatformSettings,
    ]),
    AuthModule,
  ],
  controllers: [
    AdminDashboardController,
    AdminUsersController,
    AdminActivityController,
    AdminSettingsController,
  ],
  providers: [
    AdminDashboardService,
    AdminUsersService,
    AdminActivityService,
    AdminSettingsService,
  ],
  exports: [
    AdminDashboardService,
    AdminUsersService,
    AdminActivityService,
    AdminSettingsService,
  ],
})
export class AdminModule {}
