import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { OrganizationGuardsModule } from '../auth/organization-guards.module';
import { Organization } from '../entities/organization.entity';
import { Project } from '../entities/project.entity';
import { Subscription } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';
import {
  BillingController,
  BillingWebhookController,
} from './billing.controller';
import { BillingService } from './billing.service';
import { StripeService } from './stripe.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, Organization, User, Project]),
    OrganizationGuardsModule,
    // Avoid eager AuthModule import: Auth -> Organizations -> Billing -> Auth.
    forwardRef(() => AuthModule),
  ],
  controllers: [BillingController, BillingWebhookController],
  providers: [BillingService, StripeService],
  exports: [BillingService, StripeService],
})
export class BillingModule {}
