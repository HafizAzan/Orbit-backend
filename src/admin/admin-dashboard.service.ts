import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  buildCountStatMetric,
  buildTotalStatMetric,
} from '../common/utils/billing.util';
import { ActivityEvent } from '../entities/activity-event.entity';
import { Organization } from '../entities/organization.entity';
import { Subscription } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';
import { AccountStatus } from '../enum/auth.enum';
import { OrganizationStatus, SubscriptionStatus } from '../enum/billing.enum';

export type AdminDashboardMetric = {
  id: string;
  label: string;
  value: string;
  trend: string;
  icon: 'organizations' | 'users' | 'subscriptions' | 'revenue';
  iconBg: string;
};

export type AdminRevenuePoint = {
  month: string;
  revenue: number;
};

export type AdminDashboardOverview = {
  metrics: AdminDashboardMetric[];
  growthStats: Array<{
    id: string;
    label: string;
    value: string;
    progress: number;
    helperText: string;
  }>;
  recentActivity: Array<{
    id: string;
    title: string;
    description: string;
    timeAgo: string;
    icon: 'organization' | 'upgrade' | 'seats' | 'admin';
    iconBg: string;
    iconColor: string;
  }>;
  recentSignups: Array<{
    id: string;
    name: string;
    timeAgo: string;
    planBadge: string;
    badgeClass: string;
  }>;
  topOrgs: Array<{
    id: string;
    name: string;
    plan: string;
    revenue: number;
    initial: string;
    color: string;
  }>;
  churnRate: number;
  growthForecast: number;
  orgStats: {
    total: { value: number; percentage: number };
    active: { value: number; percentage: number };
    trial: { value: number; percentage: number };
    suspended: { value: number; percentage: number };
  };
};

@Injectable()
export class AdminDashboardService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(ActivityEvent)
    private readonly activityRepository: Repository<ActivityEvent>,
  ) {}

  async getOverview(): Promise<AdminDashboardOverview> {
    const [organizations, users, subscriptions, recentEvents] =
      await Promise.all([
        this.organizationRepository.find({
          relations: { subscription: true },
          order: { createdAt: 'DESC' },
        }),
        this.userRepository.find({
          where: { isPlatformAdmin: false },
        }),
        this.subscriptionRepository.find({
          relations: { organization: true },
        }),
        this.activityRepository.find({
          order: { createdAt: 'DESC' },
          take: 8,
        }),
      ]);

    const totalOrgs = organizations.length;
    const activeOrgs = organizations.filter(
      (org) => org.status === OrganizationStatus.ACTIVE,
    ).length;
    const trialOrgs = organizations.filter(
      (org) => org.status === OrganizationStatus.TRIAL,
    ).length;
    const suspendedOrgs = organizations.filter(
      (org) => org.status === OrganizationStatus.SUSPENDED,
    ).length;

    const activeUsers = users.filter(
      (user) => user.accountStatus === AccountStatus.ACTIVE,
    ).length;
    const activeSubscriptions = subscriptions.filter(
      (item) => item.status === SubscriptionStatus.ACTIVE,
    ).length;
    const monthlyRevenue = subscriptions
      .filter((item) => item.status === SubscriptionStatus.ACTIVE)
      .reduce((sum, item) => sum + item.amountCents / 100, 0);

    const monthAgo = new Date();
    monthAgo.setMonth(monthAgo.getMonth() - 1);
    const newOrgsThisMonth = organizations.filter(
      (org) => org.createdAt >= monthAgo,
    ).length;
    const newUsersThisMonth = users.filter(
      (user) => user.createdAt >= monthAgo,
    ).length;

    const churnRate =
      totalOrgs === 0
        ? 0
        : Math.round((suspendedOrgs / Math.max(totalOrgs, 1)) * 1000) / 10;
    const growthForecast = Math.min(
      100,
      Math.round((newOrgsThisMonth / Math.max(totalOrgs, 1)) * 100) + 40,
    );

    const metrics: AdminDashboardMetric[] = [
      {
        id: 'organizations',
        label: 'Total Organizations',
        value: this.formatNumber(totalOrgs),
        trend: `+${newOrgsThisMonth} this month`,
        icon: 'organizations',
        iconBg: 'bg-indigo-50',
      },
      {
        id: 'users',
        label: 'Active Users',
        value: this.formatNumber(activeUsers),
        trend: `+${newUsersThisMonth} this month`,
        icon: 'users',
        iconBg: 'bg-sky-50',
      },
      {
        id: 'subscriptions',
        label: 'Active Subscriptions',
        value: this.formatNumber(activeSubscriptions),
        trend: `${activeSubscriptions} live`,
        icon: 'subscriptions',
        iconBg: 'bg-violet-50',
      },
      {
        id: 'revenue',
        label: 'Monthly Revenue',
        value: this.formatCurrency(monthlyRevenue),
        trend: 'From active plans',
        icon: 'revenue',
        iconBg: 'bg-emerald-50',
      },
    ];

    const growthStats = [
      {
        id: 'new-orgs',
        label: 'New Organizations',
        value: String(newOrgsThisMonth),
        progress: Math.min(100, newOrgsThisMonth * 8),
        helperText: 'Created in the last 30 days',
      },
      {
        id: 'user-growth',
        label: 'User Growth',
        value: this.formatCompact(newUsersThisMonth),
        progress: Math.min(100, newUsersThisMonth * 4),
        helperText: 'New users this month',
      },
    ];

    const recentActivity = recentEvents.map((event) => ({
      id: event.id,
      title: event.summary,
      description: `${event.actorName} · ${event.module}`,
      timeAgo: this.formatTimeAgo(event.createdAt),
      icon: this.mapActivityIcon(event.module),
      iconBg: 'bg-indigo-50',
      iconColor: 'text-indigo-600',
    }));

    const recentSignups = organizations.slice(0, 5).map((org) => ({
      id: org.id,
      name: org.name,
      timeAgo: this.formatTimeAgo(org.createdAt),
      planBadge: org.subscription?.plan ?? 'FREE',
      badgeClass: 'bg-indigo-50 text-indigo-700',
    }));

    const topOrgs = [...subscriptions]
      .filter((item) => item.status === SubscriptionStatus.ACTIVE)
      .sort((a, b) => b.amountCents - a.amountCents)
      .slice(0, 5)
      .map((item, index) => ({
        id: item.organizationId,
        name: item.organization?.name ?? 'Organization',
        plan: item.plan,
        revenue: Math.round(item.amountCents / 100),
        initial: (item.organization?.name ?? 'O').charAt(0).toUpperCase(),
        color: ['bg-violet-100 text-violet-700', 'bg-sky-100 text-sky-700', 'bg-indigo-100 text-indigo-700', 'bg-emerald-100 text-emerald-700', 'bg-amber-100 text-amber-700'][
          index % 5
        ],
      }));

    return {
      metrics,
      growthStats,
      recentActivity,
      recentSignups,
      topOrgs,
      churnRate,
      growthForecast,
      orgStats: {
        total: buildTotalStatMetric(totalOrgs),
        active: buildCountStatMetric(activeOrgs, totalOrgs),
        trial: buildCountStatMetric(trialOrgs, totalOrgs),
        suspended: buildCountStatMetric(suspendedOrgs, totalOrgs),
      },
    };
  }

  async getRevenueSeries(): Promise<AdminRevenuePoint[]> {
    const subscriptions = await this.subscriptionRepository.find({
      where: { status: SubscriptionStatus.ACTIVE },
    });

    const now = new Date();
    const points: AdminRevenuePoint[] = [];

    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = date.toLocaleString('en-US', { month: 'short' });
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const revenue = subscriptions
        .filter((item) => item.createdAt <= monthEnd)
        .reduce((sum, item) => sum + item.amountCents / 100, 0);

      points.push({ month: monthLabel, revenue: Math.round(revenue) });
    }

    return points;
  }

  private formatNumber(value: number) {
    return new Intl.NumberFormat('en-US').format(value);
  }

  private formatCompact(value: number) {
    if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
    return String(value);
  }

  private formatCurrency(value: number) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(value);
  }

  private formatTimeAgo(date: Date) {
    const diffMs = Date.now() - date.getTime();
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  private mapActivityIcon(
    module: string,
  ): 'organization' | 'upgrade' | 'seats' | 'admin' {
    if (module === 'billing') return 'upgrade';
    if (module === 'members' || module === 'teams') return 'seats';
    if (module === 'security') return 'admin';
    return 'organization';
  }
}
