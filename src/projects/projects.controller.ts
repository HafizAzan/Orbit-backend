import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  UpdateProjectDto,
  UpdateProjectMemberRoleDto,
} from './dto/project.dto';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard, OrganizationMemberGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  listProjects(@CurrentUser() user: JwtPayload) {
    return this.projectsService.listProjects(user);
  }

  @Get('assignable-members')
  listAssignableMembers(@CurrentUser() user: JwtPayload) {
    return this.projectsService.listAssignableMembers(user);
  }

  @Get(':projectId')
  getProject(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
  ) {
    return this.projectsService.getProject(user, projectId);
  }

  @Post()
  createProject(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.createProject(user, dto);
  }

  @Patch(':projectId')
  updateProject(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.updateProject(user, projectId, dto);
  }

  @Delete(':projectId')
  deleteProject(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
  ) {
    return this.projectsService.deleteProject(user, projectId);
  }

  @Get(':projectId/members')
  listProjectMembers(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
  ) {
    return this.projectsService.listProjectMembers(user, projectId);
  }

  @Post(':projectId/members')
  addProjectMember(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Body() dto: AddProjectMemberDto,
  ) {
    return this.projectsService.addProjectMember(user, projectId, dto);
  }

  @Patch(':projectId/members/:memberUserId')
  updateProjectMemberRole(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('memberUserId') memberUserId: string,
    @Body() dto: UpdateProjectMemberRoleDto,
  ) {
    return this.projectsService.updateProjectMemberRole(
      user,
      projectId,
      memberUserId,
      dto,
    );
  }

  @Delete(':projectId/members/:memberUserId')
  removeProjectMember(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('memberUserId') memberUserId: string,
  ) {
    return this.projectsService.removeProjectMember(
      user,
      projectId,
      memberUserId,
    );
  }
}
