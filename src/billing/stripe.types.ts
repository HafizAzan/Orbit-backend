import Stripe from 'stripe';

type StripeClient = InstanceType<typeof Stripe>;

export type StripeEvent = ReturnType<
  StripeClient['webhooks']['constructEvent']
>;

export type StripeCheckoutSession = Awaited<
  ReturnType<StripeClient['checkout']['sessions']['create']>
>;

export type StripeInvoice = Awaited<
  ReturnType<StripeClient['invoices']['list']>
>['data'][number];

export type StripeProduct = Awaited<
  ReturnType<StripeClient['products']['list']>
>['data'][number];

export type StripeSubscription = Awaited<
  ReturnType<StripeClient['subscriptions']['list']>
>['data'][number];

export type StripePriceRecurringInterval = NonNullable<
  Awaited<ReturnType<StripeClient['prices']['list']>>['data'][number]['recurring']
>['interval'];

export type StripeSubscriptionStatus = StripeSubscription['status'];
