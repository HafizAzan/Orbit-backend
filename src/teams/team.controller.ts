import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationAdminGuard } from '../auth/guards/organization-admin.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { ListMembersQueryDto } from '../common/dto/list-members-query.dto';
import {
  InviteTeamMemberDto,
  UpdateTeamMemberRoleDto,
  UpdateTeamMemberStatusDto,
} from './dto/team.dto';
import { TeamService } from './team.service';

@Controller('teams')
@UseGuards(JwtAuthGuard, OrganizationMemberGuard)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get('members')
  listMembers(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListMembersQueryDto,
  ) {
    return this.teamService.listMembers(user, query);
  }

  @Get('stats')
  getStats(@CurrentUser() user: JwtPayload) {
    return this.teamService.getStats(user);
  }

  @Post('invites')
  @UseGuards(OrganizationAdminGuard)
  inviteMember(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InviteTeamMemberDto,
  ) {
    return this.teamService.inviteMember(user, dto);
  }

  @Post('invites/resend-pending')
  @UseGuards(OrganizationAdminGuard)
  resendAllPendingInvites(@CurrentUser() user: JwtPayload) {
    return this.teamService.resendAllPendingInvites(user);
  }

  @Patch('members/:memberId/role')
  @UseGuards(OrganizationAdminGuard)
  updateMemberRole(
    @CurrentUser() user: JwtPayload,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateTeamMemberRoleDto,
  ) {
    return this.teamService.updateMemberRole(user, memberId, dto);
  }

  @Patch('members/:memberId/status')
  @UseGuards(OrganizationAdminGuard)
  updateMemberStatus(
    @CurrentUser() user: JwtPayload,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateTeamMemberStatusDto,
  ) {
    return this.teamService.updateMemberStatus(user, memberId, dto);
  }

  @Post('members/:memberId/resend-invite')
  @UseGuards(OrganizationAdminGuard)
  resendInvite(
    @CurrentUser() user: JwtPayload,
    @Param('memberId') memberId: string,
  ) {
    return this.teamService.resendInvite(user, memberId);
  }

  @Delete('members/:memberId')
  @UseGuards(OrganizationAdminGuard)
  deleteMember(
    @CurrentUser() user: JwtPayload,
    @Param('memberId') memberId: string,
  ) {
    return this.teamService.deleteMember(user, memberId);
  }
}
