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
import { OrganizationMemberGuard } from '../auth/guards/organization-member.guard';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  ListProjectsQueryDto,
  UpdateProjectDto,
  UpdateProjectMemberRoleDto,
} from './dto/project.dto';
import { CreateProjectCommentDto } from './dto/project-comment.dto';
import {
  ListAssignableMembersQueryDto,
  ListProjectCommentsQueryDto,
  ListProjectMembersQueryDto,
} from './dto/project-list-query.dto';
import { ProjectCommentsService } from './project-comments.service';
import { ProjectsService } from './projects.service';

@Controller('projects')
@UseGuards(JwtAuthGuard, OrganizationMemberGuard)
export class ProjectsController {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly projectCommentsService: ProjectCommentsService,
  ) {}

  @Get()
  listProjects(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListProjectsQueryDto,
  ) {
    return this.projectsService.listProjects(user, query);
  }

  @Get('assignable-members')
  listAssignableMembers(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListAssignableMembersQueryDto,
  ) {
    return this.projectsService.listAssignableMembers(user, query);
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
    @Query() query: ListProjectMembersQueryDto,
  ) {
    return this.projectsService.listProjectMembers(user, projectId, query);
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

  @Get(':projectId/comments')
  listProjectComments(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Query() query: ListProjectCommentsQueryDto,
  ) {
    return this.projectCommentsService.listComments(user, projectId, query);
  }

  @Post(':projectId/comments')
  createProjectComment(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectCommentDto,
  ) {
    return this.projectCommentsService.createComment(user, projectId, dto);
  }

  @Delete(':projectId/comments/:commentId')
  deleteProjectComment(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
    @Param('commentId') commentId: string,
  ) {
    return this.projectCommentsService.deleteComment(user, projectId, commentId);
  }
}
