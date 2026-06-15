import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  readonly client: InstanceType<typeof Stripe>;

  constructor(private readonly configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY');

    if (!secretKey) {
      throw new Error('STRIPE_SECRET_KEY is not configured.');
    }

    this.client = new Stripe(secretKey);
  }

  get webhookSecret() {
    const secret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET');

    if (!secret) {
      throw new Error('STRIPE_WEBHOOK_SECRET is not configured.');
    }

    return secret;
  }

  get refundWindowDays() {
    return this.configService.get<number>('STRIPE_REFUND_WINDOW_DAYS', 7);
  }

  constructWebhookEvent(payload: Buffer, signature: string) {
    return this.client.webhooks.constructEvent(
      payload,
      signature,
      this.webhookSecret,
    );
  }
}
