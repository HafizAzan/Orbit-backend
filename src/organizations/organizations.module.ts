import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Organization } from '../entities/organization.entity';
import { Subscription } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';
import { ProjectsModule } from '../projects/projects.module';
import { ActivityModule } from '../activity/activity.module';
import { OrganizationsController } from './organizations.controller';
import { WorkspaceOrganizationsController } from './workspace-organizations.controller';
import { OrganizationsService } from './organizations.service';
import { OrganizationAdminGuard } from '../auth/guards/organization-admin.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { OrganizationOwnerGuard } from '../auth/guards/organization-owner.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, Subscription, User]),
    forwardRef(() => AuthModule),
    forwardRef(() => ProjectsModule),
    ActivityModule,
  ],
  controllers: [OrganizationsController, WorkspaceOrganizationsController],
  providers: [
    OrganizationsService,
    OrganizationMemberGuard,
    OrganizationAdminGuard,
    OrganizationOwnerGuard,
  ],
  exports: [
    OrganizationsService,
    OrganizationMemberGuard,
    OrganizationAdminGuard,
    OrganizationOwnerGuard,
  ],
})
export class OrganizationsModule {}
