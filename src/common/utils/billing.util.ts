import {
  BillingCycle,
  PLAN_DEFAULT_AMOUNTS,
  PlanCode,
  SubscriptionStatus,
  TRIAL_DURATION_DAYS,
} from '../../enum/billing.enum';

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function toDateOnlyString(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function centsToAmount(cents: number) {
  return cents / 100;
}

export function amountToCents(amount: number) {
  return Math.round(amount * 100);
}

export function getDefaultAmountCents(plan: PlanCode, billingCycle: BillingCycle) {
  const monthlyAmount = PLAN_DEFAULT_AMOUNTS[plan];

  if (billingCycle === BillingCycle.ANNUAL) {
    return amountToCents(monthlyAmount * 12);
  }

  return amountToCents(monthlyAmount);
}

export function buildTrialSubscriptionDates(startedAt = new Date()) {
  const trialEndsAt = addDays(startedAt, TRIAL_DURATION_DAYS);

  return {
    startedAt,
    trialEndsAt,
    expiresAt: trialEndsAt,
    renewalDate: toDateOnlyString(trialEndsAt),
  };
}

export function getPlanDisplayName(plan: PlanCode) {
  switch (plan) {
    case PlanCode.FREE:
      return 'Starter';
    case PlanCode.PRO:
      return 'Pro';
    case PlanCode.BUSINESS:
      return 'Business';
    case PlanCode.ENTERPRISE:
      return 'Enterprise';
    default:
      return plan;
  }
}

type SubscriptionExpirySource = {
  expiresAt?: Date | null;
  trialEndsAt?: Date | null;
  status?: SubscriptionStatus;
  startedAt?: Date | null;
  createdAt?: Date | null;
};

export function resolveSubscriptionExpiresAt(
  subscription?: SubscriptionExpirySource | null,
) {
  if (!subscription) {
    return null;
  }

  const directExpiry = subscription.expiresAt ?? subscription.trialEndsAt;
  if (directExpiry) {
    return directExpiry.toISOString();
  }

  if (subscription.status !== SubscriptionStatus.TRIAL) {
    return null;
  }

  const trialStart =
    subscription.startedAt ??
    subscription.createdAt ??
    null;

  if (!trialStart) {
    return null;
  }

  return addDays(trialStart, TRIAL_DURATION_DAYS).toISOString();
}

export type StatMetric = {
  value: number;
  percentage: number;
};

export function toStatPercentage(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

export function buildCountStatMetric(value: number, total: number): StatMetric {
  return {
    value,
    percentage: toStatPercentage(value, total),
  };
}

export function buildTotalStatMetric(total: number): StatMetric {
  return {
    value: total,
    percentage: total > 0 ? 100 : 0,
  };
}

export function buildActiveSubscriptionDates(
  billingCycle: BillingCycle,
  startedAt = new Date(),
) {
  const renewalDays = billingCycle === BillingCycle.ANNUAL ? 365 : 30;
  const renewalDate = addDays(startedAt, renewalDays);

  return {
    startedAt,
    trialEndsAt: null,
    expiresAt: renewalDate,
    renewalDate: toDateOnlyString(renewalDate),
  };
}

export function resolveSubscriptionStatusOnUpdate(
  status: SubscriptionStatus,
  currentCancelledAt: Date | null,
) {
  if (status === SubscriptionStatus.CANCELLED) {
    return {
      status,
      cancelledAt: currentCancelledAt ?? new Date(),
    };
  }

  return {
    status,
    cancelledAt: null,
  };
}
