import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { OrganizationSubscriptionActiveGuard } from '../auth/guards/organization-subscription-active.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
@UseGuards(
  JwtAuthGuard,
  OrganizationMemberGuard,
  OrganizationSubscriptionActiveGuard,
)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.listForUser(user);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.getUnreadCount(user);
  }

  @Patch('read-all')
  markAllAsRead(@CurrentUser() user: JwtPayload) {
    return this.notificationsService.markAllAsRead(user);
  }

  @Patch(':notificationId/read')
  markAsRead(
    @CurrentUser() user: JwtPayload,
    @Param('notificationId') notificationId: string,
  ) {
    return this.notificationsService.markAsRead(user, notificationId);
  }
}
