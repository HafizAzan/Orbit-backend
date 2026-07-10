import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import {
  ListSubscriptionsQueryDto,
  UpdateSubscriptionBillingDto,
} from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  findAll(@Query() query: ListSubscriptionsQueryDto) {
    return this.subscriptionsService.findAll(query);
  }

  @Get('stats')
  getStats() {
    return this.subscriptionsService.getStats();
  }

  @Get('plan-distribution')
  getPlanDistribution() {
    return this.subscriptionsService.getPlanDistribution();
  }

  @Get('revenue-series')
  getRevenueSeries() {
    return this.subscriptionsService.getRevenueSeries();
  }

  @Patch(':id/billing')
  updateBilling(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionBillingDto,
  ) {
    return this.subscriptionsService.updateBilling(id, dto);
  }
}
