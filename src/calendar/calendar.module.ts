import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { OrganizationGuardsModule } from '../auth/organization-guards.module';
import { CalendarEvent } from '../entities/calendar-event.entity';
import { Project } from '../entities/project.entity';
import { Task } from '../entities/task.entity';
import { ProjectsModule } from '../projects/projects.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CalendarEvent, Task, Project]),
    forwardRef(() => AuthModule),
    OrganizationGuardsModule,
    forwardRef(() => ProjectsModule),
  ],
  controllers: [CalendarController],
  providers: [CalendarService],
})
export class CalendarModule {}
