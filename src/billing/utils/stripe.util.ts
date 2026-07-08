import Stripe from 'stripe';
import type {
  StripePriceRecurringInterval,
  StripeProduct,
  StripeSubscriptionStatus,
} from '../stripe.types';
import { BillingCycle, PlanCode } from '../../enum/billing.enum';

export function mapStripeIntervalToBillingCycle(
  interval: StripePriceRecurringInterval | undefined,
): BillingCycle {
  return interval === 'year' ? BillingCycle.ANNUAL : BillingCycle.MONTHLY;
}

export function formatPriceSuffix(interval: string, intervalCount: number) {
  if (interval === 'year') {
    return intervalCount === 1 ? '/year' : `/${intervalCount} years`;
  }

  if (interval === 'month') {
    return intervalCount === 1 ? '/month' : `/${intervalCount} months`;
  }

  if (interval === 'week') {
    return intervalCount === 1 ? '/week' : `/${intervalCount} weeks`;
  }

  if (interval === 'day') {
    return intervalCount === 1 ? '/day' : `/${intervalCount}-day trial`;
  }

  return '';
}

export function normalizeProductMetadata(
  metadata: Record<string, string> | null | undefined,
): Record<string, string> {
  if (!metadata) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key.trim(),
      typeof value === 'string' ? value.trim() : String(value ?? ''),
    ]),
  );
}

export function extractMarketingFeatures(
  marketingFeatures: Array<{ name?: string | null }> | null | undefined,
): string[] {
  return (marketingFeatures ?? [])
    .map((feature) => feature.name?.trim())
    .filter((name): name is string => Boolean(name));
}

export function buildMetadataLimitFeatures(
  metadata: Record<string, string>,
): string[] {
  const features: string[] = [];

  const maxFacilities = metadata.max_facilities;
  if (maxFacilities) {
    features.push(
      maxFacilities === '1'
        ? '1 facility'
        : `Up to ${maxFacilities} facilities`,
    );
  }

  const maxResidents = metadata.max_residents;
  if (maxResidents) {
    features.push(
      maxResidents === '1' ? '1 resident' : `Up to ${maxResidents} residents`,
    );
  }

  const maxStaffUsers = metadata.max_staff_users;
  if (maxStaffUsers) {
    features.push(
      maxStaffUsers === '1'
        ? '1 staff user'
        : `Up to ${maxStaffUsers} staff users`,
    );
  }

  const refundDays = metadata.refund_days;
  if (refundDays) {
    features.push(`${refundDays}-day refund window`);
  }

  return features;
}

function mergeUniqueFeatures(...featureLists: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const featureList of featureLists) {
    for (const feature of featureList) {
      const normalized = feature.trim();
      const key = normalized.toLowerCase();

      if (!normalized || seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(normalized);
    }
  }

  return merged;
}

const PLAN_TIER_SORT_ORDER: Record<string, number> = {
  starter: 1,
  free: 1,
  professional: 2,
  pro: 2,
  business: 3,
  enterprise: 4,
};

function resolveSortOrder(metadata: Record<string, string>) {
  const explicitOrder = metadata.sort_order ?? metadata.sort;

  if (explicitOrder) {
    const parsed = Number.parseInt(explicitOrder, 10);

    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  const planTier = metadata.plan_tier?.trim().toLowerCase();

  if (planTier && PLAN_TIER_SORT_ORDER[planTier] != null) {
    return PLAN_TIER_SORT_ORDER[planTier];
  }

  return 999;
}

export function parseProductFeatures(
  metadata: Record<string, string> | null | undefined,
): string[] {
  const normalizedMetadata = normalizeProductMetadata(metadata);
  const rawFeatures = normalizedMetadata.features;

  if (rawFeatures) {
    if (rawFeatures.startsWith('[')) {
      try {
        const parsed = JSON.parse(rawFeatures) as unknown;

        if (Array.isArray(parsed)) {
          return parsed
            .map(String)
            .map((item) => item.trim())
            .filter(Boolean);
        }
      } catch {
        // Fall back to delimiter parsing below.
      }
    }

    return rawFeatures
      .split(/\r?\n|\||,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return Object.entries(normalizedMetadata)
    .filter(([key]) => /^feature(?:[_-]?\d+)?$/i.test(key))
    .sort(([leftKey], [rightKey]) => {
      const leftIndex = Number(leftKey.match(/\d+/)?.[0] ?? 0);
      const rightIndex = Number(rightKey.match(/\d+/)?.[0] ?? 0);
      return leftIndex - rightIndex;
    })
    .map(([, value]) => value.trim())
    .filter(Boolean);
}

export function resolveProductFeatures(
  metadata: Record<string, string> | null | undefined,
  marketingFeatures?: Array<{ name?: string | null }> | null,
): string[] {
  const normalizedMetadata = normalizeProductMetadata(metadata);

  return mergeUniqueFeatures(
    extractMarketingFeatures(marketingFeatures),
    parseProductFeatures(normalizedMetadata),
    buildMetadataLimitFeatures(normalizedMetadata),
  );
}

export type ProductCatalogPresentation = {
  features: string[];
  metadata: Record<string, string>;
  highlighted: boolean;
  badge: string | null;
  sortOrder: number;
  ctaLabel: string | null;
  ctaType: 'checkout' | 'register' | 'contact';
};

export function parseProductCatalogPresentation(
  metadata: Record<string, string> | null | undefined,
  marketingFeatures?: Array<{ name?: string | null }> | null,
): ProductCatalogPresentation {
  const normalizedMetadata = normalizeProductMetadata(metadata);
  const ctaTypeRaw = normalizedMetadata.cta_type?.trim().toLowerCase();
  const tag = normalizedMetadata.tag?.trim() || null;

  return {
    features: resolveProductFeatures(normalizedMetadata, marketingFeatures),
    metadata: normalizedMetadata,
    highlighted:
      normalizedMetadata.highlighted === 'true' ||
      normalizedMetadata.highlighted === '1' ||
      normalizedMetadata.is_popular === 'true' ||
      tag?.toLowerCase().includes('popular') === true,
    badge:
      normalizedMetadata.badge?.trim() ||
      normalizedMetadata.badge_label?.trim() ||
      tag,
    sortOrder: resolveSortOrder(normalizedMetadata),
    ctaLabel: normalizedMetadata.cta_label?.trim() || null,
    ctaType:
      ctaTypeRaw === 'register' || ctaTypeRaw === 'contact'
        ? ctaTypeRaw
        : 'checkout',
  };
}

export function resolvePlanCodeFromProduct(product: StripeProduct): PlanCode {
  const metadata = normalizeProductMetadata(product.metadata);
  const metadataPlan =
    metadata.plan_code?.trim().toUpperCase() ||
    metadata.plan_tier?.trim().toUpperCase();

  if (metadataPlan) {
    if (metadataPlan === 'STARTER' || metadataPlan === 'FREE') {
      return PlanCode.FREE;
    }

    if (metadataPlan === 'PROFESSIONAL') {
      return PlanCode.PRO;
    }

    if (Object.values(PlanCode).includes(metadataPlan as PlanCode)) {
      return metadataPlan as PlanCode;
    }
  }

  const normalizedName = product.name.trim().toUpperCase();

  if (normalizedName.includes('ENTERPRISE')) return PlanCode.ENTERPRISE;
  if (normalizedName.includes('BUSINESS')) return PlanCode.BUSINESS;
  if (normalizedName.includes('PRO')) return PlanCode.PRO;
  if (normalizedName.includes('FREE') || normalizedName.includes('STARTER')) {
    return PlanCode.FREE;
  }

  return PlanCode.PRO;
}

export function mapStripeSubscriptionStatus(
  status: StripeSubscriptionStatus,
): 'active' | 'trial' | 'expired' | 'cancelled' {
  switch (status) {
    case 'trialing':
      return 'trial';
    case 'active':
      return 'active';
    case 'canceled':
      return 'cancelled';
    case 'unpaid':
    case 'past_due':
    case 'incomplete':
    case 'incomplete_expired':
    case 'paused':
      return 'expired';
    default:
      return 'expired';
  }
}

export function toDateOnlyStringFromUnix(timestamp: number | null | undefined) {
  if (!timestamp) return null;
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

export function toDateFromUnix(timestamp: number | null | undefined) {
  if (!timestamp) return null;
  return new Date(timestamp * 1000);
}

export function getSubscriptionPeriodEnd(stripeSubscription: {
  items: { data: Array<{ current_period_end?: number }> };
}) {
  return stripeSubscription.items.data[0]?.current_period_end ?? null;
}
