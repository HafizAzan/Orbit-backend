import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import { OrganizationSubscriptionActiveGuard } from '../auth/guards/organization-subscription-active.guard';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { AiService } from './ai.service';
import {
  ApplyWorkBreakdownDto,
  AskWorkspaceDto,
  DescribeActivityDto,
  GenerateCalendarDraftDto,
  GenerateMembershipImpactDto,
  GenerateProjectDraftDto,
  GenerateProjectSummaryDto,
  GenerateTaskDraftDto,
  GenerateTaskTipDto,
  GenerateWorkBreakdownDto,
} from './dto/ai.dto';

@Controller('ai')
@UseGuards(
  JwtAuthGuard,
  OrganizationMemberGuard,
  OrganizationSubscriptionActiveGuard,
)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('work-breakdown/generate')
  generateWorkBreakdown(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateWorkBreakdownDto,
  ) {
    return this.aiService.generateWorkBreakdown(user, dto);
  }

  @Post('project-summary/generate')
  generateProjectSummary(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateProjectSummaryDto,
  ) {
    return this.aiService.generateProjectSummary(user, dto);
  }

  @Post('project-draft/generate')
  generateProjectDraft(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateProjectDraftDto,
  ) {
    return this.aiService.generateProjectDraft(user, dto);
  }

  @Post('task-draft/generate')
  generateTaskDraft(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateTaskDraftDto,
  ) {
    return this.aiService.generateTaskDraft(user, dto);
  }

  @Post('activity/describe')
  describeActivity(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DescribeActivityDto,
  ) {
    return this.aiService.describeActivity(user, dto);
  }

  @Post('task-tip/generate')
  generateTaskTip(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateTaskTipDto,
  ) {
    return this.aiService.generateTaskTip(user, dto);
  }

  @Post('membership-impact/generate')
  generateMembershipImpact(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateMembershipImpactDto,
  ) {
    return this.aiService.generateMembershipImpact(user, dto);
  }

  @Post('calendar-draft/generate')
  generateCalendarDraft(
    @CurrentUser() user: JwtPayload,
    @Body() dto: GenerateCalendarDraftDto,
  ) {
    return this.aiService.generateCalendarDraft(user, dto);
  }

  @Post('ask-workspace')
  askWorkspace(@CurrentUser() user: JwtPayload, @Body() dto: AskWorkspaceDto) {
    return this.aiService.askWorkspace(user, dto);
  }

  @Post('work-breakdown/apply')
  applyWorkBreakdown(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ApplyWorkBreakdownDto,
  ) {
    return this.aiService.applyWorkBreakdown(user, dto);
  }
}
