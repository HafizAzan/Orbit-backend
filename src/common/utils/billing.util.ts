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
