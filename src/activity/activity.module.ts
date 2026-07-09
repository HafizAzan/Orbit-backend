import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { OrganizationGuardsModule } from '../auth/organization-guards.module';
import { ActivityEvent } from '../entities/activity-event.entity';
import { User } from '../entities/user.entity';
import { ProjectsModule } from '../projects/projects.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([ActivityEvent, User]),
    forwardRef(() => AuthModule),
    OrganizationGuardsModule,
    forwardRef(() => ProjectsModule),
  ],
  controllers: [ActivityController],
  providers: [ActivityService],
  exports: [ActivityService],
})
export class ActivityModule {}
