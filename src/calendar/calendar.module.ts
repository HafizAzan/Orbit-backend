import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CalendarEvent } from '../entities/calendar-event.entity';
import { Project } from '../entities/project.entity';
import { Task } from '../entities/task.entity';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { ProjectsModule } from '../projects/projects.module';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CalendarEvent, Task, Project]),
    forwardRef(() => AuthModule),
    forwardRef(() => ProjectsModule),
  ],
  controllers: [CalendarController],
  providers: [CalendarService, OrganizationMemberGuard],
})
export class CalendarModule {}
