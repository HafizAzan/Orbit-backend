import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  StripeCheckoutSession,
  StripeEvent,
  StripeInvoice,
  StripeProduct,
  StripeSubscription,
} from './stripe.types';
import { Organization } from '../entities/organization.entity';
import { Subscription } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';
import { AccountStatus, RegisterAs } from '../enum/auth.enum';
import {
  BillingCycle,
  OrganizationStatus,
  PlanCode,
  SubscriptionStatus,
} from '../enum/billing.enum';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { buildTrialSubscriptionDates } from '../common/utils/billing.util';
import { StripeService } from './stripe.service';
import {
  mapStripeIntervalToBillingCycle,
  mapStripeSubscriptionStatus,
  parseProductCatalogPresentation,
  resolvePlanCodeFromProduct,
  extractMarketingFeatures,
  formatPriceSuffix,
  getSubscriptionPeriodEnd,
  toDateFromUnix,
  toDateOnlyStringFromUnix,
} from './utils/stripe.util';
import {
  buildPlanEntitlements,
  hasAnyPlanFeature,
  hasPlanFeature,
  isWithinPlanLimit,
  type PlanEntitlements,
  type PlanFeatureFlag,
} from './utils/plan-entitlements.util';
import type {
  CancelPlanDto,
  ChangePlanDto,
  CreateCheckoutDto,
  ListInvoicesQueryDto,
  RefundPaymentDto,
} from './dto/billing.dto';
import {
  buildPaginatedResponse,
  paginateArray,
  resolvePagination,
  type PaginatedResponse,
} from '../common/dto/pagination-query.dto';
import { Project } from '../entities/project.entity';

export type BillingCatalogPrice = {
  id: string;
  unitAmount: number;
  currency: string;
  billingCycle: BillingCycle;
  interval: string;
  intervalCount: number;
  priceSuffix: string;
  lookupKey: string | null;
};

export type BillingCatalogProduct = {
  id: string;
  name: string;
  description: string | null;
  plan: PlanCode;
  metadata: Record<string, string>;
  features: string[];
  highlighted: boolean;
  badge: string | null;
  sortOrder: number;
  ctaLabel: string | null;
  ctaType: 'checkout' | 'register' | 'contact';
  prices: BillingCatalogPrice[];
};

export type BillingInvoiceResponse = {
  id: string;
  number: string | null;
  status: string | null;
  amountDue: number;
  amountPaid: number;
  currency: string;
  hostedInvoiceUrl: string | null;
  invoicePdf: string | null;
  createdAt: string;
  periodStart: string | null;
  periodEnd: string | null;
  refundable: boolean;
  refundWindowEndsAt: string | null;
};

export type OrganizationUsageMetric = {
  key: 'staff_users' | 'projects' | 'boards';
  label: string;
  used: number;
  limit: number | null;
  unlimited: boolean;
};

export type OrganizationUsageResponse = {
  organizationId: string;
  plan: PlanCode;
  productId: string | null;
  productName: string | null;
  status: SubscriptionStatus;
  features: string[];
  featureFlags: PlanFeatureFlag[];
  metadata: Record<string, string>;
  limits: PlanEntitlements['limits'];
  usage: {
    staffUsers: number;
    projects: number;
    boards: number;
  };
  metrics: OrganizationUsageMetric[];
};

@Injectable()
export class BillingService {
  constructor(
    private readonly configService: ConfigService,
    private readonly stripeService: StripeService,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
  ) {}

  async requiresPlanSelectionForOrganization(organizationId: string) {
    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
    });

    if (!subscription) {
      return true;
    }

    return subscription.planSelectedAt == null;
  }

  async getCatalog(): Promise<{ products: BillingCatalogProduct[] }> {
    const [products, prices] = await Promise.all([
      this.stripeService.client.products.list({ active: true, limit: 100 }),
      this.stripeService.client.prices.list({
        active: true,
        limit: 100,
        expand: ['data.product'],
      }),
    ]);

    const productMap = new Map<string, BillingCatalogProduct>();

    for (const product of products.data) {
      const presentation = parseProductCatalogPresentation(
        product.metadata,
        product.marketing_features,
      );

      productMap.set(product.id, {
        id: product.id,
        name: product.name,
        description: product.description,
        plan: resolvePlanCodeFromProduct(product),
        metadata: presentation.metadata,
        features: presentation.features,
        highlighted: presentation.highlighted,
        badge: presentation.badge,
        sortOrder: presentation.sortOrder,
        ctaLabel: presentation.ctaLabel,
        ctaType: presentation.ctaType,
        prices: [],
      });
    }

    for (const price of prices.data) {
      const productId =
        typeof price.product === 'string' ? price.product : price.product.id;
      const productRecord = productMap.get(productId);

      if (!productRecord || !price.recurring || price.unit_amount == null) {
        continue;
      }

      productRecord.prices.push({
        id: price.id,
        unitAmount: price.unit_amount / 100,
        currency: price.currency.toUpperCase(),
        billingCycle: mapStripeIntervalToBillingCycle(price.recurring.interval),
        interval: price.recurring.interval,
        intervalCount: price.recurring.interval_count,
        priceSuffix: formatPriceSuffix(
          price.recurring.interval,
          price.recurring.interval_count,
        ),
        lookupKey: price.lookup_key,
      });
    }

    return {
      products: [...productMap.values()]
        .map((product) => ({
          ...product,
          prices: product.prices.sort((a, b) => a.unitAmount - b.unitAmount),
        }))
        .filter((product) => product.prices.length > 0)
        .sort(
          (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
        ),
    };
  }

  async createCheckout(user: JwtPayload, dto: CreateCheckoutDto) {
    const { organization, subscription, owner } =
      await this.resolveOrganizationBillingContext(user);

    const price = await this.stripeService.client.prices.retrieve(dto.priceId, {
      expand: ['product'],
    });

    if (!price.active || !price.recurring) {
      throw new BadRequestException('Selected price is not available.');
    }

    const customerId = await this.ensureStripeCustomer(
      organization,
      subscription,
      owner.email,
      owner.fullName,
    );

    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const needsPlanSelection = await this.requiresPlanSelectionForOrganization(
      organization.id,
    );
    const successUrl = needsPlanSelection
      ? `${frontendUrl}/choose-plan/checkout/success?session_id={CHECKOUT_SESSION_ID}`
      : `${frontendUrl}/settings?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = needsPlanSelection
      ? `${frontendUrl}/choose-plan/checkout/cancel`
      : `${frontendUrl}/settings?checkout=cancel`;

    const session = await this.stripeService.client.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: dto.priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: organization.id,
      metadata: {
        organizationId: organization.id,
        userId: user.sub,
      },
      subscription_data: {
        metadata: {
          organizationId: organization.id,
        },
      },
    });

    if (!session.url) {
      throw new BadRequestException('Unable to start checkout.');
    }

    return {
      message: 'Checkout session created successfully.',
      sessionId: session.id,
      url: session.url,
    };
  }

  async cancelPlan(user: JwtPayload, dto: CancelPlanDto) {
    const { subscription } = await this.resolveOrganizationBillingContext(user);

    if (!subscription.stripeSubscriptionId) {
      throw new BadRequestException('No active Stripe subscription found.');
    }

    const cancelAtPeriodEnd = dto.cancelAtPeriodEnd ?? true;

    const stripeSubscription = cancelAtPeriodEnd
      ? await this.stripeService.client.subscriptions.update(
          subscription.stripeSubscriptionId,
          { cancel_at_period_end: true },
        )
      : await this.stripeService.client.subscriptions.cancel(
          subscription.stripeSubscriptionId,
        );

    await this.syncSubscriptionFromStripe(stripeSubscription);

    return {
      message: cancelAtPeriodEnd
        ? 'Subscription will cancel at the end of the current billing period.'
        : 'Subscription cancelled successfully.',
    };
  }

  async changePlan(user: JwtPayload, dto: ChangePlanDto) {
    const { subscription } = await this.resolveOrganizationBillingContext(user);

    if (!subscription.stripeSubscriptionId) {
      throw new BadRequestException(
        'No active Stripe subscription found. Start checkout first.',
      );
    }

    const price = await this.stripeService.client.prices.retrieve(dto.priceId, {
      expand: ['product'],
    });

    if (!price.active || !price.recurring) {
      throw new BadRequestException('Selected price is not available.');
    }

    const stripeSubscription =
      await this.stripeService.client.subscriptions.retrieve(
        subscription.stripeSubscriptionId,
      );

    const subscriptionItemId = stripeSubscription.items.data[0]?.id;

    if (!subscriptionItemId) {
      throw new BadRequestException('Stripe subscription item not found.');
    }

    const updatedSubscription =
      await this.stripeService.client.subscriptions.update(
        subscription.stripeSubscriptionId,
        {
          items: [{ id: subscriptionItemId, price: dto.priceId }],
          proration_behavior: 'create_prorations',
          cancel_at_period_end: false,
        },
      );

    await this.syncSubscriptionFromStripe(updatedSubscription);

    const product =
      typeof price.product === 'string'
        ? await this.stripeService.client.products.retrieve(price.product)
        : price.product;

    const productName =
      product && 'name' in product && product.name
        ? product.name
        : 'selected plan';

    return {
      message: `Plan changed to ${productName} successfully.`,
    };
  }

  async refundPayment(user: JwtPayload, dto: RefundPaymentDto) {
    const { subscription } = await this.resolveOrganizationBillingContext(user);

    if (!subscription.stripeCustomerId) {
      throw new BadRequestException(
        'No Stripe customer found for this organization.',
      );
    }

    const invoice = dto.invoiceId
      ? await this.stripeService.client.invoices.retrieve(dto.invoiceId)
      : await this.getLatestPaidInvoice(subscription.stripeCustomerId);

    if (!invoice || invoice.customer !== subscription.stripeCustomerId) {
      throw new NotFoundException('Invoice not found.');
    }

    this.assertRefundWindow(invoice);

    const paymentIntentId = await this.resolveInvoicePaymentIntentId(
      invoice.id,
    );

    if (!paymentIntentId) {
      throw new BadRequestException('This invoice cannot be refunded.');
    }

    if (invoice.amount_paid <= 0) {
      throw new BadRequestException(
        'This invoice has no paid amount to refund.',
      );
    }

    const refund = await this.stripeService.client.refunds.create({
      payment_intent: paymentIntentId,
      reason: 'requested_by_customer',
    });

    return {
      message: 'Refund processed successfully.',
      refundId: refund.id,
      amount: (refund.amount ?? 0) / 100,
      currency: refund.currency?.toUpperCase() ?? 'USD',
    };
  }

  async createCustomerPortalSession(user: JwtPayload, returnUrl?: string) {
    const { subscription } = await this.resolveOrganizationBillingContext(user);

    if (!subscription.stripeCustomerId) {
      throw new BadRequestException(
        'No Stripe customer found. Start a subscription before managing payment methods.',
      );
    }

    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const session =
      await this.stripeService.client.billingPortal.sessions.create({
        customer: subscription.stripeCustomerId,
        return_url: returnUrl ?? `${frontendUrl}/billing`,
      });

    if (!session.url) {
      throw new BadRequestException('Unable to open billing portal.');
    }

    return {
      message: 'Billing portal session created successfully.',
      url: session.url,
    };
  }

  async listInvoices(
    user: JwtPayload,
    query: ListInvoicesQueryDto = {},
  ): Promise<PaginatedResponse<BillingInvoiceResponse>> {
    const { subscription } = await this.resolveOrganizationBillingContext(user);

    if (!subscription.stripeCustomerId) {
      return paginateArray([], query);
    }

    const { page, limit } = resolvePagination(query);
    const stripeLimit = Math.min(limit, 100);
    const invoices = await this.stripeService.client.invoices.list({
      customer: subscription.stripeCustomerId,
      limit: stripeLimit,
    });

    const mapped = invoices.data.map((invoice) => this.mapInvoice(invoice));

    return buildPaginatedResponse(mapped, mapped.length, page, limit);
  }

  async getCurrentSubscription(user: JwtPayload) {
    const { organization, subscription } =
      await this.resolveOrganizationBillingContext(user);

    return {
      organizationId: organization.id,
      plan: subscription.plan,
      status: subscription.status,
      billingCycle: subscription.billingCycle,
      amount: subscription.amountCents / 100,
      currency: subscription.currency,
      renewalDate: subscription.renewalDate,
      expiresAt: subscription.expiresAt?.toISOString() ?? null,
      stripeCustomerId: subscription.stripeCustomerId,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      stripePriceId: subscription.stripePriceId,
      lastPaymentAt: subscription.lastPaymentAt?.toISOString() ?? null,
    };
  }

  async getOrganizationUsage(
    user: JwtPayload,
  ): Promise<OrganizationUsageResponse> {
    if (!user.organizationId) {
      throw new ForbiddenException('Organization membership is required.');
    }

    const organization = await this.organizationRepository.findOne({
      where: { id: user.organizationId },
      relations: { subscription: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    const subscription = await this.getOrCreateLocalSubscription(
      organization.id,
    );
    const entitlements = await this.resolveOrganizationEntitlements(
      organization.id,
    );
    const usage = await this.countOrganizationUsage(organization.id);

    const metrics: OrganizationUsageMetric[] = [
      {
        key: 'staff_users',
        label: 'Team seats',
        used: usage.staffUsers,
        limit: entitlements.limits.max_staff_users,
        unlimited:
          entitlements.limits.max_staff_users == null ||
          entitlements.limits.max_staff_users < 0,
      },
      {
        key: 'projects',
        label: 'Projects',
        used: usage.projects,
        limit: entitlements.limits.max_projects,
        unlimited:
          entitlements.limits.max_projects == null ||
          entitlements.limits.max_projects < 0,
      },
      {
        key: 'boards',
        label: 'Boards',
        used: usage.boards,
        limit: entitlements.limits.max_boards,
        unlimited:
          entitlements.limits.max_boards == null ||
          entitlements.limits.max_boards < 0,
      },
    ];

    return {
      organizationId: organization.id,
      plan: entitlements.plan,
      productId: entitlements.productId,
      productName: entitlements.productName,
      status: subscription.status,
      features: entitlements.features,
      featureFlags: entitlements.featureFlags,
      metadata: entitlements.metadata,
      limits: entitlements.limits,
      usage,
      metrics,
    };
  }

  async resolveOrganizationEntitlements(
    organizationId: string,
  ): Promise<PlanEntitlements> {
    const subscription = await this.getOrCreateLocalSubscription(organizationId);
    const product = await this.resolveSubscriptionStripeProduct(subscription);
    const presentation = product
      ? parseProductCatalogPresentation(
          product.metadata,
          product.marketing_features,
        )
      : null;

    return buildPlanEntitlements({
      plan: subscription.plan,
      productId: product?.id ?? null,
      productName: product?.name ?? null,
      metadata: presentation?.metadata ?? product?.metadata ?? {},
      features:
        presentation?.features ??
        extractMarketingFeatures(product?.marketing_features),
    });
  }

  async getOrganizationSeatLimit(organizationId: string) {
    const entitlements =
      await this.resolveOrganizationEntitlements(organizationId);
    const limit = entitlements.limits.max_staff_users;

    if (limit == null || limit < 0) {
      return Number.MAX_SAFE_INTEGER;
    }

    return limit;
  }

  async assertCanInviteMember(organizationId: string) {
    const entitlements =
      await this.resolveOrganizationEntitlements(organizationId);
    const usage = await this.countOrganizationUsage(organizationId);

    if (
      !isWithinPlanLimit(usage.staffUsers, entitlements.limits.max_staff_users)
    ) {
      throw new BadRequestException(
        'No seats available. Upgrade your plan or free up a seat first.',
      );
    }
  }

  async assertCanCreateProject(organizationId: string) {
    const entitlements =
      await this.resolveOrganizationEntitlements(organizationId);

    if (!hasPlanFeature(entitlements.featureFlags, 'projects')) {
      throw new ForbiddenException(
        'Projects are not available on your current plan. Please upgrade.',
      );
    }

    const usage = await this.countOrganizationUsage(organizationId);

    if (!isWithinPlanLimit(usage.projects, entitlements.limits.max_projects)) {
      throw new BadRequestException(
        'Project limit reached for your plan. Upgrade to create more projects.',
      );
    }
  }

  async assertHasPlanFeature(
    organizationId: string,
    feature: PlanFeatureFlag | PlanFeatureFlag[],
    message?: string,
  ) {
    const entitlements =
      await this.resolveOrganizationEntitlements(organizationId);
    const features = Array.isArray(feature) ? feature : [feature];
    const allowed = hasAnyPlanFeature(entitlements.featureFlags, features);

    if (!allowed) {
      throw new ForbiddenException(
        message ??
          `This feature is not available on your current plan. Please upgrade.`,
      );
    }
  }

  private async countOrganizationUsage(organizationId: string) {
    const [staffUsers, projects] = await Promise.all([
      this.userRepository
        .createQueryBuilder('user')
        .where('user.organizationId = :organizationId', { organizationId })
        .andWhere('user.accountStatus != :suspended', {
          suspended: AccountStatus.SUSPENDED,
        })
        .getCount(),
      this.projectRepository.count({
        where: { organizationId },
      }),
    ]);

    // Boards are currently 1:1 with projects in this product.
    return {
      staffUsers,
      projects,
      boards: projects,
    };
  }

  private async resolveSubscriptionStripeProduct(
    subscription: Subscription,
  ): Promise<StripeProduct | null> {
    if (subscription.stripePriceId) {
      const price = await this.stripeService.client.prices.retrieve(
        subscription.stripePriceId,
        { expand: ['product'] },
      );

      if (price.product && typeof price.product !== 'string') {
        return price.product as StripeProduct;
      }

      if (typeof price.product === 'string') {
        return this.stripeService.client.products.retrieve(price.product);
      }
    }

    const catalog = await this.getCatalog();
    const matched = catalog.products.find(
      (product) => product.plan === subscription.plan,
    );

    if (!matched) {
      return null;
    }

    return this.stripeService.client.products.retrieve(matched.id);
  }

  async handleWebhookEvent(event: StripeEvent) {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutCompleted(
          event.data.object as StripeCheckoutSession,
        );
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await this.syncSubscriptionFromStripe(
          event.data.object as StripeSubscription,
        );
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(
          event.data.object as StripeSubscription,
        );
        break;
      case 'invoice.paid':
        await this.handleInvoicePaid(event.data.object as StripeInvoice);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(
          event.data.object as StripeInvoice,
        );
        break;
      default:
        break;
    }

    return { received: true };
  }

  async confirmCheckout(user: JwtPayload, sessionId: string) {
    const { organization } = await this.resolveOrganizationBillingContext(user);

    const session =
      await this.stripeService.client.checkout.sessions.retrieve(sessionId);

    const organizationId = this.resolveCheckoutOrganizationId(session);

    if (!organizationId || organizationId !== organization.id) {
      throw new ForbiddenException(
        'Checkout session does not belong to this organization.',
      );
    }

    if (session.status !== 'complete') {
      throw new BadRequestException(
        'Checkout is not complete yet. Please try again in a moment.',
      );
    }

    await this.handleCheckoutCompleted(session);

    return {
      message: 'Plan activated successfully.',
    };
  }

  async selectPlan(user: JwtPayload, dto: CreateCheckoutDto) {
    const { organization, subscription } =
      await this.resolveOrganizationBillingContext(user);

    const price = await this.stripeService.client.prices.retrieve(dto.priceId, {
      expand: ['product'],
    });

    if (!price.active) {
      throw new BadRequestException('Selected price is not available.');
    }

    const unitAmount = price.unit_amount ?? 0;

    if (unitAmount > 0) {
      throw new BadRequestException('This plan requires checkout.');
    }

    const productRaw =
      price.product &&
      typeof price.product === 'object' &&
      'id' in price.product
        ? price.product
        : await this.stripeService.client.products.retrieve(
            String(price.product),
          );

    if (!productRaw || ('deleted' in productRaw && productRaw.deleted)) {
      throw new BadRequestException('Selected product is not available.');
    }

    const product = productRaw as StripeProduct;

    const dates = buildTrialSubscriptionDates();

    subscription.plan = resolvePlanCodeFromProduct(product);
    subscription.status = SubscriptionStatus.TRIAL;
    subscription.billingCycle =
      mapStripeIntervalToBillingCycle(price.recurring?.interval) ??
      BillingCycle.MONTHLY;
    subscription.amountCents = 0;
    subscription.currency = (
      price.currency ?? subscription.currency
    ).toUpperCase();
    subscription.startedAt = dates.startedAt;
    subscription.expiresAt = dates.expiresAt;
    subscription.trialEndsAt = dates.trialEndsAt;
    subscription.renewalDate = dates.renewalDate;
    subscription.planSelectedAt = new Date();
    await this.subscriptionRepository.save(subscription);

    organization.status = OrganizationStatus.TRIAL;
    await this.organizationRepository.save(organization);

    return {
      message: 'Starter plan activated successfully.',
    };
  }

  private resolveCheckoutOrganizationId(session: StripeCheckoutSession) {
    return (
      session.metadata?.organizationId ?? session.client_reference_id ?? null
    );
  }

  private async handleCheckoutCompleted(session: StripeCheckoutSession) {
    const organizationId = this.resolveCheckoutOrganizationId(session);

    if (!organizationId || !session.customer || !session.subscription) {
      return;
    }

    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer.id;
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id;

    const subscription =
      await this.getOrCreateLocalSubscription(organizationId);
    subscription.stripeCustomerId = customerId;
    subscription.stripeSubscriptionId = subscriptionId;
    await this.subscriptionRepository.save(subscription);

    const stripeSubscription =
      await this.stripeService.client.subscriptions.retrieve(subscriptionId);
    await this.syncSubscriptionFromStripe(stripeSubscription);
  }

  async syncSubscriptionFromStripe(stripeSubscription: StripeSubscription) {
    const organizationId = stripeSubscription.metadata?.organizationId;

    if (!organizationId) {
      return null;
    }

    const subscription =
      await this.getOrCreateLocalSubscription(organizationId);
    const item = stripeSubscription.items.data[0];
    const price = item?.price;
    const productId =
      price && typeof price.product === 'string'
        ? price.product
        : price?.product &&
            typeof price.product === 'object' &&
            'id' in price.product
          ? price.product.id
          : undefined;

    let product: StripeProduct | null = null;

    if (productId) {
      product = await this.stripeService.client.products.retrieve(productId);
    }

    subscription.stripeCustomerId =
      typeof stripeSubscription.customer === 'string'
        ? stripeSubscription.customer
        : stripeSubscription.customer.id;
    subscription.stripeSubscriptionId = stripeSubscription.id;
    subscription.stripePriceId = price?.id ?? null;
    subscription.plan = product
      ? resolvePlanCodeFromProduct(product)
      : subscription.plan;
    subscription.billingCycle = mapStripeIntervalToBillingCycle(
      price?.recurring?.interval,
    );
    subscription.amountCents = price?.unit_amount ?? subscription.amountCents;
    subscription.currency = (
      price?.currency ?? subscription.currency
    ).toUpperCase();
    subscription.status = mapStripeSubscriptionStatus(
      stripeSubscription.status,
    ) as SubscriptionStatus;
    subscription.startedAt =
      toDateFromUnix(stripeSubscription.start_date) ?? subscription.startedAt;
    subscription.trialEndsAt = toDateFromUnix(stripeSubscription.trial_end);
    const periodEnd = getSubscriptionPeriodEnd(stripeSubscription);
    subscription.expiresAt = toDateFromUnix(periodEnd);
    subscription.renewalDate = toDateOnlyStringFromUnix(periodEnd);
    subscription.cancelledAt =
      stripeSubscription.canceled_at != null
        ? toDateFromUnix(stripeSubscription.canceled_at)
        : stripeSubscription.cancel_at_period_end
          ? subscription.cancelledAt
          : null;
    subscription.planSelectedAt = subscription.planSelectedAt ?? new Date();

    await this.subscriptionRepository.save(subscription);

    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    if (organization) {
      organization.status =
        subscription.status === SubscriptionStatus.ACTIVE ||
        subscription.status === SubscriptionStatus.TRIAL
          ? OrganizationStatus.ACTIVE
          : subscription.status === SubscriptionStatus.CANCELLED
            ? OrganizationStatus.SUSPENDED
            : organization.status;
      await this.organizationRepository.save(organization);
    }

    return subscription;
  }

  private async handleSubscriptionDeleted(
    stripeSubscription: StripeSubscription,
  ) {
    const organizationId = stripeSubscription.metadata?.organizationId;

    if (!organizationId) return;

    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
    });

    if (!subscription) return;

    subscription.status = SubscriptionStatus.CANCELLED;
    subscription.cancelledAt = new Date();
    subscription.stripeSubscriptionId = null;
    await this.subscriptionRepository.save(subscription);
  }

  private async handleInvoicePaid(invoice: StripeInvoice) {
    const customerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;

    if (!customerId) return;

    const subscription = await this.subscriptionRepository.findOne({
      where: { stripeCustomerId: customerId },
    });

    if (!subscription) return;

    subscription.lastPaymentAt = toDateFromUnix(
      invoice.status_transitions?.paid_at ?? invoice.created,
    );
    subscription.status = SubscriptionStatus.ACTIVE;
    await this.subscriptionRepository.save(subscription);
  }

  private async handleInvoicePaymentFailed(invoice: StripeInvoice) {
    const customerId =
      typeof invoice.customer === 'string'
        ? invoice.customer
        : invoice.customer?.id;

    if (!customerId) return;

    const subscription = await this.subscriptionRepository.findOne({
      where: { stripeCustomerId: customerId },
    });

    if (!subscription) return;

    subscription.status = SubscriptionStatus.EXPIRED;
    await this.subscriptionRepository.save(subscription);
  }

  private async resolveOrganizationBillingContext(user: JwtPayload) {
    if (!user.organizationId) {
      throw new ForbiddenException('Organization membership is required.');
    }

    if (
      !user.isPlatformAdmin &&
      user.role !== RegisterAs.OWNER &&
      user.role !== RegisterAs.ADMIN
    ) {
      throw new ForbiddenException(
        'Only organization owners or admins can manage billing.',
      );
    }

    const organization = await this.organizationRepository.findOne({
      where: { id: user.organizationId },
      relations: { subscription: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    const owner = await this.userRepository.findOne({
      where: {
        organizationId: organization.id,
        role: RegisterAs.OWNER,
      },
    });

    if (!owner) {
      throw new NotFoundException('Organization owner not found.');
    }

    const subscription = await this.getOrCreateLocalSubscription(
      organization.id,
    );

    return { organization, subscription, owner };
  }

  private async getOrCreateLocalSubscription(organizationId: string) {
    let subscription = await this.subscriptionRepository.findOne({
      where: { organizationId },
    });

    if (subscription) {
      return subscription;
    }

    const dates = buildTrialSubscriptionDates();

    subscription = this.subscriptionRepository.create({
      organizationId,
      plan: PlanCode.FREE,
      status: SubscriptionStatus.TRIAL,
      billingCycle: BillingCycle.MONTHLY,
      amountCents: 0,
      currency: 'USD',
      startedAt: dates.startedAt,
      expiresAt: dates.expiresAt,
      trialEndsAt: dates.trialEndsAt,
      renewalDate: dates.renewalDate,
      planSelectedAt: null,
    });

    return this.subscriptionRepository.save(subscription);
  }

  private async ensureStripeCustomer(
    organization: Organization,
    subscription: Subscription,
    email: string,
    name: string,
  ) {
    if (subscription.stripeCustomerId) {
      return subscription.stripeCustomerId;
    }

    const customer = await this.stripeService.client.customers.create({
      email,
      name,
      metadata: {
        organizationId: organization.id,
        organizationName: organization.name,
      },
    });

    subscription.stripeCustomerId = customer.id;
    organization.billingEmail = email;
    await this.subscriptionRepository.save(subscription);
    await this.organizationRepository.save(organization);

    return customer.id;
  }

  private async getLatestPaidInvoice(customerId: string) {
    const invoices = await this.stripeService.client.invoices.list({
      customer: customerId,
      status: 'paid',
      limit: 1,
    });

    return invoices.data[0] ?? null;
  }

  private assertRefundWindow(invoice: StripeInvoice) {
    const paidAtUnix =
      invoice.status_transitions?.paid_at ?? invoice.created ?? null;

    if (!paidAtUnix) {
      throw new BadRequestException(
        'Unable to determine payment date for refund.',
      );
    }

    const windowDays = this.stripeService.refundWindowDays;
    const windowMs = windowDays * 24 * 60 * 60 * 1000;
    const paidAtMs = paidAtUnix * 1000;

    if (Date.now() - paidAtMs > windowMs) {
      throw new BadRequestException(
        `Refunds are only available within ${windowDays} days of payment.`,
      );
    }
  }

  private async resolveInvoicePaymentIntentId(invoiceId: string) {
    const payments = await this.stripeService.client.invoicePayments.list({
      invoice: invoiceId,
      limit: 10,
    });

    for (const payment of payments.data) {
      const paymentIntent = payment.payment?.payment_intent;

      if (typeof paymentIntent === 'string') {
        return paymentIntent;
      }

      if (
        paymentIntent &&
        typeof paymentIntent === 'object' &&
        'id' in paymentIntent
      ) {
        return paymentIntent.id;
      }
    }

    return null;
  }

  private mapInvoice(invoice: StripeInvoice): BillingInvoiceResponse {
    const paidAtUnix =
      invoice.status_transitions?.paid_at ?? invoice.created ?? null;
    const windowDays = this.stripeService.refundWindowDays;
    const refundWindowEndsAt =
      paidAtUnix != null
        ? new Date(
            paidAtUnix * 1000 + windowDays * 24 * 60 * 60 * 1000,
          ).toISOString()
        : null;
    const refundable =
      invoice.status === 'paid' &&
      paidAtUnix != null &&
      Date.now() <= paidAtUnix * 1000 + windowDays * 24 * 60 * 60 * 1000;

    return {
      id: invoice.id,
      number: invoice.number,
      status: invoice.status,
      amountDue: (invoice.amount_due ?? 0) / 100,
      amountPaid: (invoice.amount_paid ?? 0) / 100,
      currency: invoice.currency.toUpperCase(),
      hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
      invoicePdf: invoice.invoice_pdf ?? null,
      createdAt: new Date(invoice.created * 1000).toISOString(),
      periodStart: invoice.period_start
        ? new Date(invoice.period_start * 1000).toISOString()
        : null,
      periodEnd: invoice.period_end
        ? new Date(invoice.period_end * 1000).toISOString()
        : null,
      refundable,
      refundWindowEndsAt,
    };
  }
}
