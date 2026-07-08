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
  UpdateOrganizationMemberEmailDto,
  UpdateOrganizationMemberRoleDto,
  UpdateWorkspaceOrganizationDto,
} from './dto/workspace-organization.dto';
import { ConfirmOrganizationTwoFactorDto } from './dto/organization-two-factor.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard, OrganizationMemberGuard)
export class WorkspaceOrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('me')
  getCurrent(@CurrentUser() user: JwtPayload) {
    return this.organizationsService.getCurrentOrganization(user);
  }

  @Get('me/about')
  getAbout(@CurrentUser() user: JwtPayload) {
    return this.organizationsService.getOrganizationAbout(user);
  }

  @Patch('me')
  @UseGuards(OrganizationAdminGuard)
  updateCurrent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateWorkspaceOrganizationDto,
  ) {
    return this.organizationsService.updateCurrentOrganization(user, dto);
  }

  @Get('me/2fa/status')
  @UseGuards(OrganizationAdminGuard)
  getTwoFactorStatus(@CurrentUser() user: JwtPayload) {
    return this.organizationsService.getOrganizationTwoFactorStatus(user);
  }

  @Post('me/2fa/setup')
  @UseGuards(OrganizationAdminGuard)
  setupTwoFactor(@CurrentUser() user: JwtPayload) {
    return this.organizationsService.setupOrganizationTwoFactor(user);
  }

  @Post('me/2fa/confirm')
  @UseGuards(OrganizationAdminGuard)
  confirmTwoFactor(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConfirmOrganizationTwoFactorDto,
  ) {
    return this.organizationsService.confirmOrganizationTwoFactor(
      user,
      dto.code,
    );
  }

  @Get('me/members')
  listMembers(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListMembersQueryDto,
  ) {
    return this.organizationsService.listCurrentMembers(user, query);
  }

  @Patch('me/members/:memberId')
  @UseGuards(OrganizationAdminGuard)
  updateMemberRole(
    @CurrentUser() user: JwtPayload,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateOrganizationMemberRoleDto,
  ) {
    return this.organizationsService.updateMemberRole(user, memberId, dto.role);
  }

  @Patch('me/members/:memberId/email')
  @UseGuards(OrganizationAdminGuard)
  updateMemberEmail(
    @CurrentUser() user: JwtPayload,
    @Param('memberId') memberId: string,
    @Body() dto: UpdateOrganizationMemberEmailDto,
  ) {
    return this.organizationsService.updateMemberEmail(
      user,
      memberId,
      dto.email,
    );
  }

  @Delete('me/members/:memberId')
  @UseGuards(OrganizationAdminGuard)
  removeMember(
    @CurrentUser() user: JwtPayload,
    @Param('memberId') memberId: string,
  ) {
    return this.organizationsService.removeMember(user, memberId);
  }
}
