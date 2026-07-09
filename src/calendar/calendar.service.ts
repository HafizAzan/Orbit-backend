import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Not, Repository } from 'typeorm';
import {
  mapCalendarEventRecord,
  mapProjectDueDateToCalendarEvent,
  mapTaskToCalendarEvent,
  type CalendarEventResponse,
} from '../common/mappers/calendar.mapper';
import { CalendarEvent } from '../entities/calendar-event.entity';
import { Project } from '../entities/project.entity';
import { Task } from '../entities/task.entity';
import { TaskStatus } from '../enum/task.enum';
import { RegisterAs } from '../enum/auth.enum';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { hasOrgWideProjectAccess } from '../projects/project-access.util';
import { ContentModerationService } from '../common/services/content-moderation.service';
import { ProjectsService } from '../projects/projects.service';
import { canViewAllOrganizationTasks } from '../tasks/task-access.util';
import {
  CreateCalendarEventDto,
  ListCalendarEventsQueryDto,
  ListCalendarProjectsQueryDto,
  UpdateCalendarEventDto,
} from './dto/calendar.dto';
import {
  paginateArray,
  type PaginatedResponse,
} from '../common/dto/pagination-query.dto';

@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(CalendarEvent)
    private readonly calendarEventRepository: Repository<CalendarEvent>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly projectsService: ProjectsService,
    private readonly contentModerationService: ContentModerationService,
  ) {}

  async listEvents(
    user: JwtPayload,
    query: ListCalendarEventsQueryDto,
  ): Promise<PaginatedResponse<CalendarEventResponse>> {
    this.ensureValidRange(query.from, query.to);

    const organizationId = user.organizationId!;
    const projectIds =
      await this.projectsService.resolveAccessibleProjectIds(user);

    const [records, tasks, projects] = await Promise.all([
      this.calendarEventRepository.find({
        where: {
          organizationId,
          date: Between(query.from, query.to),
        },
        order: { date: 'ASC', createdAt: 'ASC' },
      }),
      this.loadTasksForCalendar(user, organizationId, projectIds, query),
      this.loadProjectsForCalendar(organizationId, projectIds, query),
    ]);

    const visibleRecords = hasOrgWideProjectAccess(user.role)
      ? records
      : records.filter(
          (event) =>
            !event.projectId ||
            projectIds.includes(event.projectId) ||
            event.createdById === user.sub,
        );

    const events = [
      ...visibleRecords.map(mapCalendarEventRecord),
      ...tasks.map(mapTaskToCalendarEvent),
      ...projects.map(mapProjectDueDateToCalendarEvent),
    ].sort((left, right) => left.date.localeCompare(right.date));

    return paginateArray(events, query);
  }

  async createEvent(user: JwtPayload, dto: CreateCalendarEventDto) {
    this.ensureCanManageCustomCalendarEvents(user);
    await this.contentModerationService.assertCleanContent(user.sub, {
      title: dto.title,
      description: dto.description,
    });

    if (dto.projectId) {
      await this.projectsService.ensureAccessibleProject(
        user,
        dto.projectId,
        true,
      );
    }

    const event = await this.calendarEventRepository.save(
      this.calendarEventRepository.create({
        organizationId: user.organizationId!,
        projectId: dto.projectId ?? null,
        createdById: user.sub,
        title: dto.title.trim(),
        date: dto.date,
        type: dto.type,
        description: dto.description?.trim() ?? '',
      }),
    );

    return mapCalendarEventRecord(event);
  }

  async updateEvent(
    user: JwtPayload,
    eventId: string,
    dto: UpdateCalendarEventDto,
  ) {
    this.ensureCanManageCustomCalendarEvents(user);
    await this.contentModerationService.assertCleanContent(user.sub, {
      title: dto.title,
      description: dto.description,
    });
    const event = await this.getOwnedEvent(user, eventId);

    if (dto.title !== undefined) {
      event.title = dto.title.trim();
    }

    if (dto.date !== undefined) {
      event.date = dto.date;
    }

    if (dto.type !== undefined) {
      event.type = dto.type;
    }

    if (dto.description !== undefined) {
      event.description = dto.description.trim();
    }

    if (dto.projectId !== undefined) {
      if (dto.projectId) {
        await this.projectsService.ensureAccessibleProject(
          user,
          dto.projectId,
          true,
        );
        event.projectId = dto.projectId;
      } else {
        event.projectId = null;
      }
    }

    const saved = await this.calendarEventRepository.save(event);
    return mapCalendarEventRecord(saved);
  }

  async deleteEvent(user: JwtPayload, eventId: string) {
    this.ensureCanManageCustomCalendarEvents(user);
    const event = await this.getOwnedEvent(user, eventId);
    await this.calendarEventRepository.delete(event.id);

    return {
      message: 'Event deleted.',
    };
  }

  async getProjectSummaries(
    user: JwtPayload,
    query: ListCalendarProjectsQueryDto = {},
  ): Promise<
    PaginatedResponse<{
      id: string;
      name: string;
      dotClass: string;
      eventCount: number;
    }>
  > {
    const projectIds =
      await this.projectsService.resolveAccessibleProjectIds(user);

    if (projectIds.length === 0) {
      return paginateArray([], query);
    }

    const projects = await this.projectRepository.find({
      where: { id: In(projectIds) },
      order: { name: 'ASC' },
    });

    const eventCounts = await this.calendarEventRepository
      .createQueryBuilder('event')
      .select('event.projectId', 'projectId')
      .addSelect('COUNT(event.id)', 'count')
      .where('event.organizationId = :organizationId', {
        organizationId: user.organizationId!,
      })
      .andWhere('event.projectId IN (:...projectIds)', { projectIds })
      .groupBy('event.projectId')
      .getRawMany<{ projectId: string; count: string }>();

    const countMap = new Map(
      eventCounts.map((row) => [row.projectId, Number(row.count)]),
    );

    const dotClasses = [
      'bg-sky-500',
      'bg-teal-500',
      'bg-violet-500',
      'bg-amber-500',
      'bg-rose-500',
      'bg-emerald-500',
    ];

    const summaries = projects.map((project, index) => ({
      id: project.id,
      name: project.name,
      dotClass: dotClasses[index % dotClasses.length],
      eventCount: countMap.get(project.id) ?? 0,
    }));

    return paginateArray(summaries, query);
  }

  private ensureCanManageCustomCalendarEvents(user: JwtPayload) {
    if (user.role === RegisterAs.MEMBER) {
      throw new ForbiddenException(
        'Members have read-only calendar access. Update tasks from My Tasks instead.',
      );
    }
  }

  private async getOwnedEvent(user: JwtPayload, eventId: string) {
    const event = await this.calendarEventRepository.findOne({
      where: { id: eventId, organizationId: user.organizationId! },
    });

    if (!event) {
      throw new NotFoundException('Calendar event not found.');
    }

    if (event.createdById !== user.sub) {
      throw new ForbiddenException('You can only modify events you created.');
    }

    return event;
  }

  private ensureValidRange(from: string, to: string) {
    if (from > to) {
      throw new BadRequestException(
        'The "from" date must be before the "to" date.',
      );
    }
  }

  private async loadTasksForCalendar(
    user: JwtPayload,
    organizationId: string,
    projectIds: string[],
    query: ListCalendarEventsQueryDto,
  ) {
    if (projectIds.length === 0) {
      return [];
    }

    const where = canViewAllOrganizationTasks(user.role)
      ? {
          organizationId,
          projectId: In(projectIds),
          dueDate: Between(query.from, query.to),
          status: Not(TaskStatus.DONE),
        }
      : {
          organizationId,
          projectId: In(projectIds),
          dueDate: Between(query.from, query.to),
          status: Not(TaskStatus.DONE),
          assigneeId: user.sub,
        };

    return this.taskRepository.find({ where });
  }

  private async loadProjectsForCalendar(
    organizationId: string,
    projectIds: string[],
    query: ListCalendarEventsQueryDto,
  ) {
    if (projectIds.length === 0) {
      return [];
    }

    return this.projectRepository.find({
      where: {
        organizationId,
        id: In(projectIds),
        dueDate: Between(query.from, query.to),
      },
    });
  }
}
