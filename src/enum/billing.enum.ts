export enum OrganizationStatus {
  ACTIVE = 'active',
  TRIAL = 'trial',
  SUSPENDED = 'suspended',
}

export enum PlanCode {
  FREE = 'FREE',
  PRO = 'PRO',
  BUSINESS = 'BUSINESS',
  ENTERPRISE = 'ENTERPRISE',
}

export enum SubscriptionStatus {
  ACTIVE = 'active',
  TRIAL = 'trial',
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
}

export enum BillingCycle {
  MONTHLY = 'Monthly',
  ANNUAL = 'Annual',
}

export const PLAN_DEFAULT_AMOUNTS: Record<PlanCode, number> = {
  [PlanCode.FREE]: 0,
  [PlanCode.PRO]: 299,
  [PlanCode.BUSINESS]: 899,
  [PlanCode.ENTERPRISE]: 12000,
};

export const TRIAL_DURATION_DAYS = 14;
