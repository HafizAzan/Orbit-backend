import {
  Controller,
  Delete,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { OrganizationSubscriptionActiveGuard } from '../auth/guards/organization-subscription-active.guard';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { ActivityService } from './activity.service';
import { ListActivityQueryDto } from './dto/list-activity-query.dto';

@Controller('activity')
@UseGuards(JwtAuthGuard, OrganizationMemberGuard, OrganizationSubscriptionActiveGuard)
export class ActivityController {
  constructor(private readonly activityService: ActivityService) {}

  @Get()
  listActivities(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListActivityQueryDto,
  ) {
    return this.activityService.listActivities(user, query);
  }

  @Get('feed')
  getFeed(@CurrentUser() user: JwtPayload) {
    return this.activityService.getFeed(user, 5);
  }

  @Delete(':activityId')
  deleteActivity(
    @CurrentUser() user: JwtPayload,
    @Param('activityId') activityId: string,
  ) {
    return this.activityService.deleteActivity(user, activityId);
  }
}
