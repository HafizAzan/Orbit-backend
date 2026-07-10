import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ActivityModule } from '../activity/activity.module';
import { Project } from '../entities/project.entity';
import { User } from '../entities/user.entity';
import { ProjectsModule } from '../projects/projects.module';
import { GitHubIntegrationService } from './github-integration.service';
import { GitHubWebhookController } from './github-webhook.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, User]),
    forwardRef(() => ActivityModule),
    forwardRef(() => ProjectsModule),
  ],
  controllers: [GitHubWebhookController],
  providers: [GitHubIntegrationService],
  exports: [GitHubIntegrationService],
})
export class GitHubModule {}
