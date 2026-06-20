import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Organization } from '../entities/organization.entity';
import { ProjectComment } from '../entities/project-comment.entity';
import { ProjectMember } from '../entities/project-member.entity';
import { Project } from '../entities/project.entity';
import { Task } from '../entities/task.entity';
import { User } from '../entities/user.entity';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { ProjectCommentsService } from './project-comments.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      ProjectMember,
      ProjectComment,
      Task,
      Organization,
      User,
    ]),
    forwardRef(() => AuthModule),
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectCommentsService, OrganizationMemberGuard],
  exports: [ProjectsService],
})
export class ProjectsModule {}
