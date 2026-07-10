import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { AdminAiService } from './admin-ai.service';
import {
  AskPlatformDto,
  DescribePlatformActivityDto,
  OrgHealthDto,
} from './dto/platform-ai.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard, PlatformAdminGuard)
export class AdminAiController {
  constructor(private readonly adminAiService: AdminAiService) {}

  @Post('ask-platform')
  askPlatform(@CurrentUser() user: JwtPayload, @Body() dto: AskPlatformDto) {
    return this.adminAiService.askPlatform(user, dto);
  }

  @Post('org-health')
  orgHealth(@CurrentUser() user: JwtPayload, @Body() dto: OrgHealthDto) {
    return this.adminAiService.orgHealth(user, dto);
  }

  @Post('describe-platform-activity')
  describePlatformActivity(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DescribePlatformActivityDto,
  ) {
    return this.adminAiService.describePlatformActivity(user, dto);
  }
}
