import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { OrganizationGuardsModule } from '../auth/organization-guards.module';
import { BillingModule } from '../billing/billing.module';
import { EmailModule } from '../email/email.module';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { ProjectsModule } from '../projects/projects.module';
import { ActivityModule } from '../activity/activity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, User]),
    EmailModule,
    forwardRef(() => BillingModule),
    forwardRef(() => AuthModule),
    OrganizationGuardsModule,
    forwardRef(() => ProjectsModule),
    ActivityModule,
    NotificationsModule,
  ],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
