import {
  BillingCycle,
  PlanCode,
  SubscriptionStatus,
} from '../enum/billing.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Organization } from './organization.entity';

@Entity('subscriptions')
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid', unique: true })
  organizationId: string;

  @OneToOne(() => Organization, (organization) => organization.subscription, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({
    type: 'enum',
    enum: PlanCode,
    default: PlanCode.FREE,
  })
  plan: PlanCode;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.TRIAL,
  })
  status: SubscriptionStatus;

  @Column({
    name: 'billing_cycle',
    type: 'enum',
    enum: BillingCycle,
    default: BillingCycle.MONTHLY,
  })
  billingCycle: BillingCycle;

  @Column({ name: 'amount_cents', type: 'integer', default: 0 })
  amountCents: number;

  @Column({ length: 3, default: 'USD' })
  currency: string;

  @Column({ name: 'renewal_date', type: 'date', nullable: true })
  renewalDate: string | null;

  @Column({ name: 'started_at', type: 'timestamptz' })
  startedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ name: 'trial_ends_at', type: 'timestamptz', nullable: true })
  trialEndsAt: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({
    name: 'stripe_customer_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  stripeCustomerId: string | null;

  @Column({
    name: 'stripe_subscription_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  stripeSubscriptionId: string | null;

  @Column({
    name: 'stripe_price_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  stripePriceId: string | null;

  @Column({ name: 'last_payment_at', type: 'timestamptz', nullable: true })
  lastPaymentAt: Date | null;

  @Column({ name: 'plan_selected_at', type: 'timestamptz', nullable: true })
  planSelectedAt: Date | null;

  @Column({ name: 'ai_credits_used', type: 'integer', default: 0 })
  aiCreditsUsed: number;

  @Column({
    name: 'ai_credits_period_key',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  aiCreditsPeriodKey: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
