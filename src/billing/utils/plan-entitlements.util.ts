import { PlanCode } from '../../enum/billing.enum';
import { normalizeProductMetadata } from './stripe.util';

export const PLAN_FEATURE_FLAGS = [
  'projects',
  'boards',
  'tasks',
  'basic_reporting',
  'advanced_workflows',
  'team_dashboards',
  'reports',
  'multi_team',
  'advanced_permissions',
  'workload_reports',
  'priority_support',
  'dedicated_onboarding',
  'sso',
  'custom_roles',
  'dedicated_success',
  'custom_sla',
  'ai_assistant',
  'github_integration',
] as const;

export type PlanFeatureFlag = (typeof PLAN_FEATURE_FLAGS)[number];

export type PlanLimitKey =
  | 'max_staff_users'
  | 'max_projects'
  | 'max_boards'
  | 'max_ai_credits';

export type PlanLimits = Record<PlanLimitKey, number | null>;

export type PlanEntitlements = {
  plan: PlanCode;
  productId: string | null;
  productName: string | null;
  metadata: Record<string, string>;
  features: string[];
  featureFlags: PlanFeatureFlag[];
  limits: PlanLimits;
};

const FALLBACK_SEAT_LIMITS: Record<PlanCode, number> = {
  [PlanCode.FREE]: 5,
  [PlanCode.PRO]: 50,
  [PlanCode.BUSINESS]: 250,
  [PlanCode.ENTERPRISE]: 1000,
};

const FALLBACK_PROJECT_BOARD_LIMITS: Record<PlanCode, number> = {
  [PlanCode.FREE]: 500,
  [PlanCode.PRO]: 1500,
  [PlanCode.BUSINESS]: 3000,
  [PlanCode.ENTERPRISE]: 8000,
};

const FALLBACK_AI_CREDIT_LIMITS: Record<PlanCode, number> = {
  [PlanCode.FREE]: 500,
  [PlanCode.PRO]: 2000,
  [PlanCode.BUSINESS]: 5000,
  [PlanCode.ENTERPRISE]: 10000,
};

const FALLBACK_FEATURE_FLAGS: Record<PlanCode, PlanFeatureFlag[]> = {
  [PlanCode.FREE]: [
    'projects',
    'boards',
    'tasks',
    'basic_reporting',
    'ai_assistant',
    'github_integration',
  ],
  [PlanCode.PRO]: [
    'projects',
    'boards',
    'tasks',
    'basic_reporting',
    'advanced_workflows',
    'team_dashboards',
    'reports',
    'priority_support',
    'ai_assistant',
    'github_integration',
  ],
  [PlanCode.BUSINESS]: [
    'projects',
    'boards',
    'tasks',
    'basic_reporting',
    'advanced_workflows',
    'team_dashboards',
    'reports',
    'multi_team',
    'advanced_permissions',
    'workload_reports',
    'priority_support',
    'ai_assistant',
    'github_integration',
  ],
  [PlanCode.ENTERPRISE]: [
    'projects',
    'boards',
    'tasks',
    'basic_reporting',
    'advanced_workflows',
    'team_dashboards',
    'reports',
    'multi_team',
    'advanced_permissions',
    'workload_reports',
    'priority_support',
    'dedicated_onboarding',
    'sso',
    'custom_roles',
    'dedicated_success',
    'custom_sla',
    'ai_assistant',
    'github_integration',
  ],
};

const FEATURE_FLAG_SET = new Set<string>(PLAN_FEATURE_FLAGS);

export function parseLimitValue(raw: string | undefined): number | null {
  if (raw == null || raw.trim() === '') {
    return null;
  }

  const normalized = raw.trim().toLowerCase();

  if (
    normalized === 'unlimited' ||
    normalized === 'inf' ||
    normalized === 'infinity' ||
    normalized === '-1'
  ) {
    return -1;
  }

  const parsed = Number.parseInt(normalized, 10);

  if (Number.isNaN(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

export function parseFeatureFlags(
  metadata: Record<string, string>,
  plan: PlanCode,
): PlanFeatureFlag[] {
  const raw =
    metadata.feature_flags?.trim() ||
    metadata.features_flags?.trim() ||
    metadata.plan_features?.trim() ||
    '';

  if (raw) {
    const parsed = raw
      .split(/[|,]/)
      .map((item) => item.trim().toLowerCase())
      .filter((item): item is PlanFeatureFlag => FEATURE_FLAG_SET.has(item));

    if (parsed.length > 0) {
      return [...new Set(parsed)];
    }
  }

  return [...FALLBACK_FEATURE_FLAGS[plan]];
}

export function resolvePlanLimits(
  metadata: Record<string, string>,
  plan: PlanCode,
): PlanLimits {
  const maxStaffUsers =
    parseLimitValue(metadata.max_staff_users) ??
    parseLimitValue(metadata.max_seats) ??
    FALLBACK_SEAT_LIMITS[plan];

  const maxProjects =
    parseLimitValue(metadata.max_projects) ??
    FALLBACK_PROJECT_BOARD_LIMITS[plan];

  const maxBoards =
    parseLimitValue(metadata.max_boards) ??
    parseLimitValue(metadata.max_projects) ??
    FALLBACK_PROJECT_BOARD_LIMITS[plan];

  const maxAiCredits =
    parseLimitValue(metadata.ai_credits_monthly) ??
    parseLimitValue(metadata.max_ai_credits) ??
    FALLBACK_AI_CREDIT_LIMITS[plan];

  return {
    max_staff_users: maxStaffUsers,
    max_projects: maxProjects,
    max_boards: maxBoards,
    max_ai_credits: maxAiCredits,
  };
}

export function currentAiCreditsPeriodKey(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

export function hasPlanFeature(
  featureFlags: readonly string[],
  flag: PlanFeatureFlag | string,
) {
  return featureFlags.includes(flag);
}

export function hasAnyPlanFeature(
  featureFlags: readonly string[],
  flags: readonly (PlanFeatureFlag | string)[],
) {
  return flags.some((flag) => hasPlanFeature(featureFlags, flag));
}

export function isWithinPlanLimit(used: number, limit: number | null) {
  if (limit == null || limit < 0) {
    return true;
  }

  return used < limit;
}

export function formatPlanLimit(limit: number | null) {
  if (limit == null || limit < 0) {
    return 'Unlimited';
  }

  return String(limit);
}

export function buildPlanEntitlements(input: {
  plan: PlanCode;
  productId?: string | null;
  productName?: string | null;
  metadata?: Record<string, string> | null;
  features?: string[];
}): PlanEntitlements {
  const metadata = normalizeProductMetadata(input.metadata);
  const featureFlags = parseFeatureFlags(metadata, input.plan);

  return {
    plan: input.plan,
    productId: input.productId ?? null,
    productName: input.productName ?? null,
    metadata,
    features: input.features ?? [],
    featureFlags,
    limits: resolvePlanLimits(metadata, input.plan),
  };
}
