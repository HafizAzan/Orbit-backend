import { Injectable, NotFoundException } from '@nestjs/common';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import {
  buildPaginatedResponse,
  resolvePagination,
  type PaginatedResponse,
} from '../common/dto/pagination-query.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  amountToCents,
  buildCountStatMetric,
  getDefaultAmountCents,
  getPlanDisplayName,
  resolveSubscriptionStatusOnUpdate,
  toStatPercentage,
} from '../common/utils/billing.util';
import {
  mapSubscriptionResponse,
  type PlanDistributionItem,
  type SubscriptionResponse,
  type SubscriptionStatsResponse,
} from '../common/mappers/billing.mapper';
import { Organization } from '../entities/organization.entity';
import { Subscription } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';
import { RegisterAs } from '../enum/auth.enum';
import { PlanCode, SubscriptionStatus } from '../enum/billing.enum';
import { UpdateSubscriptionBillingDto } from './dto/subscription.dto';

@Injectable()
export class SubscriptionsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async findAll(
    query: PaginationQueryDto = {},
  ): Promise<PaginatedResponse<SubscriptionResponse>> {
    const { page, limit, skip, take } = resolvePagination(query);
    const [subscriptions, total] =
      await this.subscriptionRepository.findAndCount({
        relations: { organization: true },
        order: { createdAt: 'DESC' },
        skip,
        take,
      });

    const responses: SubscriptionResponse[] = [];

    for (const subscription of subscriptions) {
      const contactEmail = await this.resolveContactEmail(subscription);
      responses.push(
        mapSubscriptionResponse(
          subscription,
          subscription.organization.name,
          contactEmail,
        ),
      );
    }

    return buildPaginatedResponse(responses, total, page, limit);
  }

  async getStats(): Promise<SubscriptionStatsResponse> {
    const subscriptions = await this.subscriptionRepository.find();
    const total = subscriptions.length;

    const activePlans = subscriptions.filter(
      (item) => item.status === SubscriptionStatus.ACTIVE,
    ).length;
    const expiredPlans = subscriptions.filter(
      (item) => item.status === SubscriptionStatus.EXPIRED,
    ).length;

    const monthlyRevenue = subscriptions
      .filter((item) => item.status === SubscriptionStatus.ACTIVE)
      .reduce((sum, item) => sum + item.amountCents / 100, 0);

    const annualRevenue = monthlyRevenue * 12;
    const activeRate = toStatPercentage(activePlans, total);

    return {
      monthlyRevenue: { value: monthlyRevenue, percentage: activeRate },
      annualRevenue: { value: annualRevenue, percentage: activeRate },
      activePlans: buildCountStatMetric(activePlans, total),
      expiredPlans: buildCountStatMetric(expiredPlans, total),
    };
  }

  async getPlanDistribution(): Promise<PlanDistributionItem[]> {
    const subscriptions = await this.subscriptionRepository.find();
    const total = subscriptions.length || 1;
    const planCodes = Object.values(PlanCode);

    return planCodes.map((plan) => {
      const count = subscriptions.filter((item) => item.plan === plan).length;

      return {
        code: plan,
        name: getPlanDisplayName(plan),
        count,
        percentage: Math.round((count / total) * 100),
      };
    });
  }

  async updateBilling(
    id: string,
    dto: UpdateSubscriptionBillingDto,
  ): Promise<SubscriptionResponse> {
    const subscription = await this.subscriptionRepository.findOne({
      where: { id },
      relations: { organization: true },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found.');
    }

    if (dto.plan) {
      subscription.plan = dto.plan;
    }

    if (dto.billingCycle) {
      subscription.billingCycle = dto.billingCycle;
    }

    if (dto.renewalDate) {
      subscription.renewalDate = dto.renewalDate;
      subscription.expiresAt = new Date(dto.renewalDate);
    }

    if (dto.amount !== undefined) {
      subscription.amountCents = amountToCents(dto.amount);
    } else if (dto.plan || dto.billingCycle) {
      subscription.amountCents = getDefaultAmountCents(
        subscription.plan,
        subscription.billingCycle,
      );
    }

    if (dto.status) {
      const resolved = resolveSubscriptionStatusOnUpdate(
        dto.status,
        subscription.cancelledAt,
      );
      subscription.status = resolved.status;
      subscription.cancelledAt = resolved.cancelledAt;
    }

    const saved = await this.subscriptionRepository.save(subscription);
    const contactEmail = await this.resolveContactEmail(saved);

    return mapSubscriptionResponse(
      saved,
      saved.organization.name,
      contactEmail,
    );
  }

  private async resolveContactEmail(subscription: Subscription) {
    if (subscription.organization.billingEmail) {
      return subscription.organization.billingEmail;
    }

    const owner = await this.userRepository.findOne({
      where: {
        organizationId: subscription.organizationId,
        role: RegisterAs.OWNER,
      },
    });

    return owner?.email ?? '—';
  }
}
