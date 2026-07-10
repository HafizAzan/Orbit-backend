import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  buildPaginatedResponse,
  resolvePagination,
  type PaginatedResponse,
} from '../common/dto/pagination-query.dto';
import {
  buildCountStatMetric,
  buildTotalStatMetric,
} from '../common/utils/billing.util';
import { ActivityEvent } from '../entities/activity-event.entity';
import { Organization } from '../entities/organization.entity';
import { ActivityAction, ActivityModule } from '../enum/activity.enum';
import {
  ActivityFlagReason,
  ActivityReviewStatus,
} from '../enum/activity-review.enum';
import {
  FlagAdminActivityDto,
  ListAdminActivityQueryDto,
} from './dto/admin-activity.dto';

export type AdminActivityRecord = {
  id: string;
  title: string;
  description: string;
  organization: string;
  organizationId: string;
  actor: string;
  category: string;
  severity: 'info' | 'success' | 'warning' | 'critical';
  timestamp: string;
  reviewStatus: ActivityReviewStatus;
  flagReason?: ActivityFlagReason;
  flagNote?: string;
  flaggedAt?: string;
  resolvedAt?: string;
  module: ActivityModule;
  action: string;
};

export type AdminActivityStats = {
  total: { value: number; percentage: number };
  flagged: { value: number; percentage: number };
  resolved: { value: number; percentage: number };
  today: { value: number; percentage: number };
};

@Injectable()
export class AdminActivityService {
  constructor(
    @InjectRepository(ActivityEvent)
    private readonly activityRepository: Repository<ActivityEvent>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
  ) {}

  async findAll(
    query: ListAdminActivityQueryDto = {},
  ): Promise<PaginatedResponse<AdminActivityRecord>> {
    const { page, limit, skip, take } = resolvePagination(query);
    const qb = this.activityRepository
      .createQueryBuilder('event')
      .orderBy('event.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (query.module) {
      qb.andWhere('event.module = :module', { module: query.module });
    }

    if (query.flagged === true || query.reviewStatus === ActivityReviewStatus.FLAGGED) {
      qb.andWhere('event.reviewStatus = :flagged', {
        flagged: ActivityReviewStatus.FLAGGED,
      });
    } else if (query.reviewStatus) {
      qb.andWhere('event.reviewStatus = :reviewStatus', {
        reviewStatus: query.reviewStatus,
      });
    }

    if (query.search?.trim()) {
      qb.andWhere(
        '(event.summary ILIKE :search OR event.actorName ILIKE :search OR event.targetLabel ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    const [events, total] = await qb.getManyAndCount();
    const orgIds = [...new Set(events.map((event) => event.organizationId))];
    const organizations = orgIds.length
      ? await this.organizationRepository.find({ where: { id: In(orgIds) } })
      : [];
    const orgMap = new Map(organizations.map((org) => [org.id, org.name]));

    return buildPaginatedResponse(
      events.map((event) => this.mapEvent(event, orgMap.get(event.organizationId) ?? '—')),
      total,
      page,
      limit,
    );
  }

  async getStats(): Promise<AdminActivityStats> {
    const total = await this.activityRepository.count();
    const flagged = await this.activityRepository.count({
      where: { reviewStatus: ActivityReviewStatus.FLAGGED },
    });
    const resolved = await this.activityRepository.count({
      where: { reviewStatus: ActivityReviewStatus.RESOLVED },
    });

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const today = await this.activityRepository
      .createQueryBuilder('event')
      .where('event.createdAt >= :startOfDay', { startOfDay })
      .getCount();

    return {
      total: buildTotalStatMetric(total),
      flagged: buildCountStatMetric(flagged, total),
      resolved: buildCountStatMetric(resolved, total),
      today: buildCountStatMetric(today, total),
    };
  }

  async flag(id: string, dto: FlagAdminActivityDto) {
    const event = await this.getEvent(id);
    event.reviewStatus = ActivityReviewStatus.FLAGGED;
    event.flagReason = dto.reason;
    event.flagNote = dto.note?.trim() || null;
    event.flaggedAt = new Date();
    event.resolvedAt = null;
    await this.activityRepository.save(event);
    return this.mapWithOrg(event);
  }

  async resolve(id: string) {
    const event = await this.getEvent(id);
    event.reviewStatus = ActivityReviewStatus.RESOLVED;
    event.resolvedAt = new Date();
    await this.activityRepository.save(event);
    return this.mapWithOrg(event);
  }

  async unflag(id: string) {
    const event = await this.getEvent(id);
    event.reviewStatus = ActivityReviewStatus.NONE;
    event.flagReason = null;
    event.flagNote = null;
    event.flaggedAt = null;
    event.resolvedAt = null;
    await this.activityRepository.save(event);
    return this.mapWithOrg(event);
  }

  private async getEvent(id: string) {
    const event = await this.activityRepository.findOne({ where: { id } });
    if (!event) throw new NotFoundException('Activity event not found.');
    return event;
  }

  private async mapWithOrg(event: ActivityEvent) {
    const org = await this.organizationRepository.findOne({
      where: { id: event.organizationId },
    });
    return this.mapEvent(event, org?.name ?? '—');
  }

  private mapEvent(event: ActivityEvent, organizationName: string): AdminActivityRecord {
    return {
      id: event.id,
      title: event.summary,
      description: event.targetLabel
        ? `${event.action} · ${event.targetLabel}`
        : event.action,
      organization: organizationName,
      organizationId: event.organizationId,
      actor: event.actorName,
      category: this.mapCategory(event.module),
      severity: this.mapSeverity(event),
      timestamp: event.createdAt.toISOString(),
      reviewStatus: event.reviewStatus,
      flagReason: event.flagReason ?? undefined,
      flagNote: event.flagNote ?? undefined,
      flaggedAt: event.flaggedAt?.toISOString(),
      resolvedAt: event.resolvedAt?.toISOString(),
      module: event.module,
      action: event.action,
    };
  }

  private mapCategory(module: ActivityModule) {
    switch (module) {
      case ActivityModule.BILLING:
        return 'billing';
      case ActivityModule.MEMBERS:
      case ActivityModule.TEAMS:
        return 'user';
      case ActivityModule.SECURITY:
        return 'system';
      case ActivityModule.ORGANIZATION:
        return 'organization';
      default:
        return 'organization';
    }
  }

  private mapSeverity(
    event: ActivityEvent,
  ): 'info' | 'success' | 'warning' | 'critical' {
    if (event.reviewStatus === ActivityReviewStatus.FLAGGED) return 'critical';
    if (event.module === ActivityModule.SECURITY) return 'warning';
    if (event.module === ActivityModule.BILLING) return 'warning';
    if (
      event.action === ActivityAction.CREATED ||
      event.action === ActivityAction.INVITED
    ) {
      return 'success';
    }
    return 'info';
  }
}
