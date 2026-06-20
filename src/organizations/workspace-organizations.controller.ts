import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
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
  UpdateOrganizationMemberRoleDto,
  UpdateWorkspaceOrganizationDto,
} from './dto/workspace-organization.dto';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
@UseGuards(JwtAuthGuard, OrganizationMemberGuard)
export class WorkspaceOrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Get('me')
  getCurrent(@CurrentUser() user: JwtPayload) {
    return this.organizationsService.getCurrentOrganization(user);
  }

  @Patch('me')
  @UseGuards(OrganizationAdminGuard)
  updateCurrent(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateWorkspaceOrganizationDto,
  ) {
    return this.organizationsService.updateCurrentOrganization(user, dto);
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

  @Delete('me/members/:memberId')
  @UseGuards(OrganizationAdminGuard)
  removeMember(
    @CurrentUser() user: JwtPayload,
    @Param('memberId') memberId: string,
  ) {
    return this.organizationsService.removeMember(user, memberId);
  }
}
