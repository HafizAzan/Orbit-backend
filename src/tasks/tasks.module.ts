import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { Project } from '../entities/project.entity';
import { Task } from '../entities/task.entity';
import { TaskAttachment } from '../entities/task-attachment.entity';
import { User } from '../entities/user.entity';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { ProjectsModule } from '../projects/projects.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, TaskAttachment, Project, User]),
    forwardRef(() => AuthModule),
    forwardRef(() => ProjectsModule),
  ],
  controllers: [TasksController],
  providers: [TasksService, OrganizationMemberGuard],
  exports: [TasksService],
})
export class TasksModule {}
