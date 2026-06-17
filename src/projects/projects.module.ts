import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Organization } from '../entities/organization.entity';
import { ProjectMember } from '../entities/project-member.entity';
import { Project } from '../entities/project.entity';
import { User } from '../entities/user.entity';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, ProjectMember, Organization, User]),
    forwardRef(() => AuthModule),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, OrganizationMemberGuard],
  exports: [ProjectsService],
})
export class ProjectsModule {}
