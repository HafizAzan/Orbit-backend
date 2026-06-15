import { Organization } from '../../entities/organization.entity';
import { Subscription } from '../../entities/subscription.entity';
import { User } from '../../entities/user.entity';
import {
  BillingCycle,
  OrganizationStatus,
  PlanCode,
  SubscriptionStatus,
} from '../../enum/billing.enum';
import { RegisterAs } from '../../enum/auth.enum';
import {
  getPlanDisplayName,
  resolveSubscriptionExpiresAt,
  type StatMetric,
} from '../utils/billing.util';

export type { StatMetric };

export type OrganizationPlanResponse = {
  code: PlanCode;
  name: string;
  status: SubscriptionStatus;
  createdAt: string;
  expiresAt: string | null;
};

export type OrganizationResponse = {
  id: string;
  name: string;
  slug: string;
  ownerName: string;
  ownerEmail: string;
  plan: OrganizationPlanResponse;
  users: number;
  projects: number;
  status: OrganizationStatus;
  createdAt: string;
};

export type OrganizationStatsResponse = {
  total: StatMetric;
  active: StatMetric;
  trial: StatMetric;
  suspended: StatMetric;
};

export type SubscriptionResponse = {
  id: string;
  organizationId: string;
  organizationName: string;
  contactEmail: string;
  plan: PlanCode;
  billingCycle: BillingCycle;
  renewalDate: string;
  amount: number;
  status: SubscriptionStatus;
  currency: string;
  startedAt: string;
  expiresAt: string | null;
  cancelledAt: string | null;
  trialEndsAt: string | null;
  createdAt: string;
};

export type SubscriptionStatsResponse = {
  monthlyRevenue: StatMetric;
  annualRevenue: StatMetric;
  activePlans: StatMetric;
  expiredPlans: StatMetric;
};

export type PlanDistributionItem = {
  code: PlanCode;
  name: string;
  count: number;
  percentage: number;
};

function toIsoDate(value: Date | string | null | undefined) {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toDateOnly(value: Date | string | null | undefined) {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

export function mapSubscriptionResponse(
  subscription: Subscription,
  organizationName: string,
  contactEmail: string,
): SubscriptionResponse {
  return {
    id: subscription.id,
    organizationId: subscription.organizationId,
    organizationName,
    contactEmail,
    plan: subscription.plan,
    billingCycle: subscription.billingCycle,
    renewalDate: toDateOnly(subscription.renewalDate),
    amount: subscription.amountCents / 100,
    status: subscription.status,
    currency: subscription.currency,
    startedAt: subscription.startedAt.toISOString(),
    expiresAt: resolveSubscriptionExpiresAt(subscription),
    cancelledAt: toIsoDate(subscription.cancelledAt),
    trialEndsAt: toIsoDate(subscription.trialEndsAt) ?? resolveSubscriptionExpiresAt(subscription),
    createdAt: subscription.createdAt.toISOString(),
  };
}

export function mapOrganizationResponse(
  organization: Organization,
  usersCount: number,
  owner?: User | null,
): OrganizationResponse {
  const subscription = organization.subscription;
  const ownerUser =
    owner ??
    organization.users?.find((user) => user.role === RegisterAs.OWNER) ??
    null;
  const planCode = subscription?.plan ?? PlanCode.FREE;

  return {
    id: organization.id,
    name: organization.name,
    slug: organization.slug,
    ownerName: ownerUser?.fullName ?? '—',
    ownerEmail: ownerUser?.email ?? organization.billingEmail ?? '—',
    plan: {
      code: planCode,
      name: getPlanDisplayName(planCode),
      status: subscription?.status ?? SubscriptionStatus.TRIAL,
      createdAt:
        subscription?.createdAt.toISOString() ??
        organization.createdAt.toISOString(),
      expiresAt: resolveSubscriptionExpiresAt(subscription),
    },
    users: usersCount,
    projects: organization.projectCount,
    status: organization.status,
    createdAt: organization.createdAt.toISOString().slice(0, 10),
  };
}
