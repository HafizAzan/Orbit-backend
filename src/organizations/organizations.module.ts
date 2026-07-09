import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { OrganizationGuardsModule } from '../auth/organization-guards.module';
import { Organization } from '../entities/organization.entity';
import { Subscription } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';
import { ProjectsModule } from '../projects/projects.module';
import { ActivityModule } from '../activity/activity.module';
import { OrganizationsController } from './organizations.controller';
import { WorkspaceOrganizationsController } from './workspace-organizations.controller';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, Subscription, User]),
    forwardRef(() => AuthModule),
    OrganizationGuardsModule,
    forwardRef(() => ProjectsModule),
    ActivityModule,
  ],
  controllers: [OrganizationsController, WorkspaceOrganizationsController],
  providers: [OrganizationsService],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
