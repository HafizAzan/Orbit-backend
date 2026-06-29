import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '../email/email.module';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { OrganizationAdminGuard } from '../auth/guards/organization-admin.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { ProjectsModule } from '../projects/projects.module';
import { ActivityModule } from '../activity/activity.module';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, User]),
    EmailModule,
    forwardRef(() => AuthModule),
    forwardRef(() => ProjectsModule),
    ActivityModule,
  ],
  controllers: [TeamController],
  providers: [TeamService, OrganizationMemberGuard, OrganizationAdminGuard],
  exports: [TeamService],
})
export class TeamModule {}
