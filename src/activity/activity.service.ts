import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import {
  buildPaginatedResponse,
  resolvePagination,
} from '../common/dto/pagination-query.dto';
import {
  mapActivityEventResponse,
  mapActivityFeedItem,
  type ActivityEventResponse,
  type ActivityFeedItemResponse,
} from '../common/mappers/activity.mapper';
import { canDeleteActivity } from '../common/utils/activity-access.util';
import { ActivityEvent } from '../entities/activity-event.entity';
import { User } from '../entities/user.entity';
import {
  ActivityAction,
  ActivityModule,
  MANAGER_ACTIVITY_MODULES,
} from '../enum/activity.enum';
import { RegisterAs } from '../enum/auth.enum';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { ProjectsService } from '../projects/projects.service';
import { ListActivityQueryDto } from './dto/list-activity-query.dto';

export type RecordActivityInput = {
  organizationId: string;
  actorId: string;
  actorName: string;
  actorRole: RegisterAs;
  module: ActivityModule;
  action: ActivityAction;
  summary: string;
  targetLabel?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
  projectId?: string | null;
  metadata?: Record<string, unknown> | null;
};

@Injectable()
export class ActivityService {
  constructor(
    @InjectRepository(ActivityEvent)
    private readonly activityRepository: Repository<ActivityEvent>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
  ) {}

  async record(input: RecordActivityInput) {
    const event = this.activityRepository.create({
      organizationId: input.organizationId,
      actorId: input.actorId,
      actorName: input.actorName.trim(),
      actorRole: input.actorRole,
      module: input.module,
      action: input.action,
      summary: input.summary.trim(),
      targetLabel: input.targetLabel?.trim() ?? null,
      resourceType: input.resourceType ?? null,
      resourceId: input.resourceId ?? null,
      projectId: input.projectId ?? null,
      metadata: input.metadata ?? null,
    });

    return this.activityRepository.save(event);
  }

  async recordForUser(user: JwtPayload, input: Omit<RecordActivityInput, 'actorId' | 'actorName' | 'actorRole' | 'organizationId'>) {
    const actor = await this.userRepository.findOne({ where: { id: user.sub } });

    if (!actor || !user.organizationId) {
      return null;
    }

    return this.record({
      organizationId: user.organizationId,
      actorId: actor.id,
      actorName: actor.fullName,
      actorRole: actor.role,
      ...input,
    });
  }

  async getFeed(user: JwtPayload, limit = 5): Promise<ActivityFeedItemResponse[]> {
    const events = await this.fetchVisibleEvents(user, { page: 1, limit });

    return events.map((event) =>
      mapActivityFeedItem(event, canDeleteActivity(user, event)),
    );
  }

  async listActivities(user: JwtPayload, query: ListActivityQueryDto = {}) {
    const { page, limit, skip, take } = resolvePagination(query);
    const qb = await this.createVisibleQuery(user, query);
    const [events, total] = await qb.skip(skip).take(take).getManyAndCount();

    return buildPaginatedResponse(
      events.map((event) =>
        mapActivityEventResponse(event, canDeleteActivity(user, event)),
      ),
      total,
      page,
      limit,
    );
  }

  async deleteActivity(user: JwtPayload, activityId: string) {
    const event = await this.activityRepository.findOne({
      where: { id: activityId, organizationId: user.organizationId! },
    });

    if (!event) {
      throw new NotFoundException('Activity log not found.');
    }

    if (!canDeleteActivity(user, event)) {
      throw new ForbiddenException('You do not have permission to delete this activity log.');
    }

    await this.activityRepository.delete(event.id);

    return {
      message: 'Activity log removed successfully.',
    };
  }

  private async fetchVisibleEvents(
    user: JwtPayload,
    query: ListActivityQueryDto = {},
  ) {
    if (!user.organizationId) {
      return [] as ActivityEvent[];
    }

    const { skip, take } = resolvePagination(query);
    const qb = await this.createVisibleQuery(user, query);

    return qb.skip(skip).take(take).getMany();
  }

  private async createVisibleQuery(user: JwtPayload, query: ListActivityQueryDto) {
    const qb = this.activityRepository
      .createQueryBuilder('activity')
      .where('activity.organization_id = :organizationId', {
        organizationId: user.organizationId!,
      })
      .orderBy('activity.created_at', 'DESC');

    if (query.module) {
      qb.andWhere('activity.module = :module', { module: query.module });
    }

    await this.applyVisibilityScope(user, qb);

    return qb;
  }

  private async applyVisibilityScope(
    user: JwtPayload,
    qb: ReturnType<Repository<ActivityEvent>['createQueryBuilder']>,
  ) {
    if (user.role === RegisterAs.OWNER) {
      return;
    }

    if (user.role === RegisterAs.ADMIN) {
      qb.andWhere('activity.actor_role IN (:...roles)', {
        roles: [RegisterAs.ADMIN, RegisterAs.MANAGER, RegisterAs.MEMBER],
      });
      return;
    }

    if (user.role === RegisterAs.MANAGER) {
      const projectIds = await this.projectsService.resolveAccessibleProjectIds(user);
      const squadIds = [...(await this.projectsService.getSquadUserIds(user))];

      qb.andWhere('activity.module IN (:...modules)', {
        modules: MANAGER_ACTIVITY_MODULES,
      });

      qb.andWhere(
        new Brackets((scope) => {
          scope.where('activity.actor_id = :actorId', { actorId: user.sub });

          if (projectIds.length > 0) {
            scope.orWhere('activity.project_id IN (:...projectIds)', {
              projectIds,
            });
          }

          if (squadIds.length > 0) {
            scope.orWhere(
              new Brackets((teamScope) => {
                teamScope
                  .where('activity.module = :teamsModule', {
                    teamsModule: ActivityModule.TEAMS,
                  })
                  .andWhere('activity.actor_id IN (:...squadIds)', { squadIds });
              }),
            );
          }
        }),
      );

      return;
    }

    qb.andWhere('1 = 0');
  }
}
