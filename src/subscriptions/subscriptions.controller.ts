import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { UpdateSubscriptionBillingDto } from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

@Controller('admin/subscriptions')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get()
  findAll() {
    return this.subscriptionsService.findAll();
  }

  @Get('stats')
  getStats() {
    return this.subscriptionsService.getStats();
  }

  @Get('plan-distribution')
  getPlanDistribution() {
    return this.subscriptionsService.getPlanDistribution();
  }

  @Patch(':id/billing')
  updateBilling(
    @Param('id') id: string,
    @Body() dto: UpdateSubscriptionBillingDto,
  ) {
    return this.subscriptionsService.updateBilling(id, dto);
  }
}
