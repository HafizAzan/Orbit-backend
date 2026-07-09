import { getQueueToken } from '@nestjs/bullmq';
import { Module, Provider, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityModule } from '../activity/activity.module';
import { AuthModule } from '../auth/auth.module';
import { OrganizationGuardsModule } from '../auth/organization-guards.module';
import { Organization } from '../entities/organization.entity';
import { Project } from '../entities/project.entity';
import { Task } from '../entities/task.entity';
import { ProjectsModule } from '../projects/projects.module';
import { QUEUE_ENABLED } from '../queues/queue-enabled.token';
import { AI_QUEUE } from '../queues/queue.constants';
import { AiQueueService } from '../queues/ai-queue.service';
import { AiQueueProcessor } from '../queues/processors/ai.processor';
import { TasksModule } from '../tasks/tasks.module';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { CursorProvider } from './providers/cursor.provider';

const queueEnabled =
  String(process.env.QUEUE_ENABLED ?? 'false').toLowerCase() === 'true';

const aiQueueProviders: Provider[] = queueEnabled
  ? [
      {
        provide: AiQueueService,
        inject: [QUEUE_ENABLED, getQueueToken(AI_QUEUE)],
        useFactory: (
          enabled: boolean,
          queue: ConstructorParameters<typeof AiQueueService>[1],
        ) => new AiQueueService(enabled, queue),
      },
      AiQueueProcessor,
    ]
  : [
      {
        provide: AiQueueService,
        useFactory: () => new AiQueueService(false),
      },
    ];

@Module({
  imports: [
    TypeOrmModule.forFeature([Organization, Project, Task]),
    OrganizationGuardsModule,
    forwardRef(() => AuthModule),
    forwardRef(() => ProjectsModule),
    forwardRef(() => TasksModule),
    forwardRef(() => ActivityModule),
  ],
  controllers: [AiController],
  providers: [AiService, CursorProvider, ...aiQueueProviders],
  exports: [AiService, CursorProvider],
})
export class AiModule {}
