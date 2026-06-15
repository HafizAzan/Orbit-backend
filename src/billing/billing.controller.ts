import {
  Body,
  Controller,
  Get,
  Headers,
  Logger,
  Post,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationBillingGuard } from '../auth/guards/organization-billing.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { BillingService } from './billing.service';
import {
  CancelPlanDto,
  ChangePlanDto,
  ConfirmCheckoutDto,
  CreateCheckoutDto,
  RefundPaymentDto,
} from './dto/billing.dto';
import { StripeService } from './stripe.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('catalog')
  getCatalog() {
    return this.billingService.getCatalog();
  }

  @Get('subscription')
  @UseGuards(JwtAuthGuard, OrganizationBillingGuard)
  getCurrentSubscription(@CurrentUser() user: JwtPayload) {
    return this.billingService.getCurrentSubscription(user);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard, OrganizationBillingGuard)
  createCheckout(@CurrentUser() user: JwtPayload, @Body() dto: CreateCheckoutDto) {
    return this.billingService.createCheckout(user, dto);
  }

  @Post('checkout/confirm')
  @UseGuards(JwtAuthGuard, OrganizationBillingGuard)
  confirmCheckout(@CurrentUser() user: JwtPayload, @Body() dto: ConfirmCheckoutDto) {
    return this.billingService.confirmCheckout(user, dto.sessionId);
  }

  @Post('select-plan')
  @UseGuards(JwtAuthGuard, OrganizationBillingGuard)
  selectPlan(@CurrentUser() user: JwtPayload, @Body() dto: CreateCheckoutDto) {
    return this.billingService.selectPlan(user, dto);
  }

  @Post('cancel')
  @UseGuards(JwtAuthGuard, OrganizationBillingGuard)
  cancelPlan(@CurrentUser() user: JwtPayload, @Body() dto: CancelPlanDto) {
    return this.billingService.cancelPlan(user, dto);
  }

  @Post('change-plan')
  @UseGuards(JwtAuthGuard, OrganizationBillingGuard)
  changePlan(@CurrentUser() user: JwtPayload, @Body() dto: ChangePlanDto) {
    return this.billingService.changePlan(user, dto);
  }

  @Post('refund')
  @UseGuards(JwtAuthGuard, OrganizationBillingGuard)
  refundPayment(@CurrentUser() user: JwtPayload, @Body() dto: RefundPaymentDto) {
    return this.billingService.refundPayment(user, dto);
  }

  @Get('invoices')
  @UseGuards(JwtAuthGuard, OrganizationBillingGuard)
  listInvoices(@CurrentUser() user: JwtPayload) {
    return this.billingService.listInvoices(user);
  }
}

@Controller('billing/webhooks')
export class BillingWebhookController {
  private readonly logger = new Logger(BillingWebhookController.name);

  constructor(
    private readonly billingService: BillingService,
    private readonly stripeService: StripeService,
  ) {}

  @Post('stripe')
  handleStripeWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header.');
    }

    if (!request.rawBody) {
      throw new BadRequestException('Missing raw request body.');
    }

    let event;
    try {
      event = this.stripeService.constructWebhookEvent(
        request.rawBody,
        signature,
      );
    } catch (error) {
      this.logger.warn(
        `Stripe webhook signature verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new BadRequestException('Invalid Stripe webhook signature.');
    }

    return this.billingService.handleWebhookEvent(event);
  }
}
