import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { OrganizationGuardsModule } from '../auth/organization-guards.module';
import { Project } from '../entities/project.entity';
import { Task } from '../entities/task.entity';
import { TaskAttachment } from '../entities/task-attachment.entity';
import { User } from '../entities/user.entity';
import { ProjectsModule } from '../projects/projects.module';
import { ActivityModule } from '../activity/activity.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task, TaskAttachment, Project, User]),
    forwardRef(() => AuthModule),
    OrganizationGuardsModule,
    forwardRef(() => ProjectsModule),
    ActivityModule,
    NotificationsModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
