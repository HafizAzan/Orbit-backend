import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import type { TeamMemberProjectDetail } from '../common/mappers/team.mapper';
import {
  mapAssignableProjectMember,
  mapWorkspaceProjectResponse,
  type ProjectTaskStats,
  type WorkspaceProjectResponse,
} from '../common/mappers/project.mapper';
import { Organization } from '../entities/organization.entity';
import { ProjectMember } from '../entities/project-member.entity';
import { ProjectUserTheme } from '../entities/project-user-theme.entity';
import { Project } from '../entities/project.entity';
import { Task } from '../entities/task.entity';
import { User } from '../entities/user.entity';
import { AccountStatus, RegisterAs } from '../enum/auth.enum';
import {
  ProjectMemberRole,
  ProjectStatus,
  ProjectTheme,
} from '../enum/project.enum';
import { TaskStatus } from '../enum/task.enum';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { ActivityService } from '../activity/activity.service';
import { ActivityAction, ActivityModule } from '../enum/activity.enum';
import {
  buildPaginatedResponse,
  paginateArray,
  resolvePagination,
  type PaginatedResponse,
} from '../common/dto/pagination-query.dto';
import {
  AddProjectMemberDto,
  CreateProjectDto,
  ListProjectsQueryDto,
  UpdateProjectDto,
  UpdateProjectMemberRoleDto,
  UpdateMyProjectThemeDto,
} from './dto/project.dto';
import {
  ListAssignableMembersQueryDto,
  ListProjectMembersQueryDto,
} from './dto/project-list-query.dto';
import {
  canDeleteProject,
  canEditProject,
  canMarkProjectComplete,
  canManageProjectMembership,
  hasOrgWideProjectAccess,
  isOperationalProjectLeadRole,
} from './project-access.util';
import { normalizeProjectTheme } from '../common/theme-normalize.util';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(ProjectMember)
    private readonly projectMemberRepository: Repository<ProjectMember>,
    @InjectRepository(ProjectUserTheme)
    private readonly projectUserThemeRepository: Repository<ProjectUserTheme>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(forwardRef(() => ActivityService))
    private readonly activityService: ActivityService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async listProjects(user: JwtPayload, query: ListProjectsQueryDto = {}) {
    const { page, limit, skip, take } = resolvePagination(query);

    const [projects, total] = await this.findAccessibleProjectsPaginated(
      user,
      skip,
      limit,
    );
    const statsByProjectId = await this.loadProjectTaskStats(
      projects.map((project) => project.id),
    );
    const themesByProjectId = await this.loadUserThemesForProjects(
      user.sub,
      projects.map((project) => project.id),
    );

    return buildPaginatedResponse(
      projects.map((project) =>
        mapWorkspaceProjectResponse(
          project,
          this.resolveViewerRole(user, project.members ?? []),
          statsByProjectId.get(project.id),
          themesByProjectId.get(project.id) ?? ProjectTheme.CLASSIC,
        ),
      ),
      total,
      page,
      limit,
    );
  }

  async getProject(user: JwtPayload, projectId: string) {
    const project = await this.getAccessibleProject(user, projectId);
    const membership = this.findMembership(project.members ?? [], user.sub);
    const statsByProjectId = await this.loadProjectTaskStats([project.id]);
    const viewerTheme = await this.resolveViewerTheme(user.sub, project.id);

    return mapWorkspaceProjectResponse(
      project,
      this.resolveViewerRole(user, project.members ?? [], membership),
      statsByProjectId.get(project.id),
      viewerTheme,
    );
  }

  async updateMyProjectTheme(
    user: JwtPayload,
    projectId: string,
    dto: UpdateMyProjectThemeDto,
  ) {
    await this.getAccessibleProject(user, projectId);

    const theme = normalizeProjectTheme(dto.theme);

    const existing = await this.projectUserThemeRepository.findOne({
      where: { userId: user.sub, projectId },
    });

    if (existing) {
      existing.theme = theme;
      await this.projectUserThemeRepository.save(existing);
    } else {
      await this.projectUserThemeRepository.save(
        this.projectUserThemeRepository.create({
          userId: user.sub,
          projectId,
          theme,
        }),
      );
    }

    return this.getProject(user, projectId);
  }

  async createProject(user: JwtPayload, dto: CreateProjectDto) {
    const organizationId = user.organizationId!;

    await this.ensureUniqueProjectKey(organizationId, dto.key.trim().toUpperCase());

    const leadUserId = await this.resolveProjectLeadUserId(
      user,
      organizationId,
      dto.leadUserId,
    );

    const memberIds = await this.resolveProjectMemberIds(
      organizationId,
      leadUserId,
      dto.memberIds ?? [],
    );

    const project = await this.projectRepository.save(
      this.projectRepository.create({
        organizationId,
        name: dto.name.trim(),
        key: dto.key.trim().toUpperCase(),
        description: dto.description?.trim() ?? '',
        category: dto.category,
        priority: dto.priority,
        status: dto.status,
        visibility: dto.visibility,
        startDate: dto.startDate ?? null,
        dueDate: dto.dueDate ?? null,
        leadUserId,
        createdById: user.sub,
      }),
    );

    const addedMemberIds = await this.syncProjectMembers(
      project.id,
      memberIds,
      leadUserId,
      true,
    );
    await this.incrementOrganizationProjectCount(organizationId);

    const actorName = await this.getUserDisplayName(user.sub);
    void this.notificationsService.notifyProjectMembership({
      organizationId,
      projectId: project.id,
      projectName: project.name,
      actorUserId: user.sub,
      actorName,
      memberUserIds: addedMemberIds,
    });

    await this.activityService.recordForUser(user, {
      module: ActivityModule.PROJECTS,
      action: ActivityAction.CREATED,
      summary: `Created project ${project.name}`,
      targetLabel: project.name,
      resourceType: 'project',
      resourceId: project.id,
      projectId: project.id,
    });

    return this.getProject(user, project.id);
  }

  async updateProject(user: JwtPayload, projectId: string, dto: UpdateProjectDto) {
    const project = await this.getAccessibleProject(user, projectId, true);
    const membership = this.findMembership(project.members ?? [], user.sub);

    if (!canEditProject(user, membership)) {
      throw new ForbiddenException('You do not have permission to edit this project.');
    }

    if (dto.key && dto.key.trim().toUpperCase() !== project.key) {
      await this.ensureUniqueProjectKey(
        project.organizationId,
        dto.key.trim().toUpperCase(),
        project.id,
      );
      project.key = dto.key.trim().toUpperCase();
    }

    if (dto.name) project.name = dto.name.trim();
    if (dto.description !== undefined) project.description = dto.description.trim();
    if (dto.category) project.category = dto.category;
    if (dto.priority) project.priority = dto.priority;
    if (dto.status !== undefined && dto.status !== project.status) {
      await this.applyProjectStatusChange(user, project, dto.status);
    }
    if (dto.visibility) project.visibility = dto.visibility;
    if (dto.startDate !== undefined) project.startDate = dto.startDate ?? null;
    if (dto.dueDate !== undefined) project.dueDate = dto.dueDate ?? null;
    if (dto.progress !== undefined) project.progress = dto.progress;

    if (dto.leadUserId !== undefined && hasOrgWideProjectAccess(user.role)) {
      if (!canManageProjectMembership(user, membership)) {
        throw new ForbiddenException('You do not have permission to change the project lead.');
      }

      project.leadUserId = await this.resolveProjectLeadUserId(
        user,
        project.organizationId,
        dto.leadUserId,
      );
    }

    await this.projectRepository.save(project);

    if (dto.memberIds) {
      if (!canManageProjectMembership(user, membership)) {
        throw new ForbiddenException('You do not have permission to manage project members.');
      }

      const leadUserId = project.leadUserId ?? user.sub;
      const memberIds = await this.resolveProjectMemberIds(
        project.organizationId,
        leadUserId,
        dto.memberIds,
      );

      const addedMemberIds = await this.syncProjectMembers(
        project.id,
        memberIds,
        leadUserId,
        false,
      );

      const actorName = await this.getUserDisplayName(user.sub);
      void this.notificationsService.notifyProjectMembership({
        organizationId: project.organizationId,
        projectId: project.id,
        projectName: project.name,
        actorUserId: user.sub,
        actorName,
        memberUserIds: addedMemberIds,
      });
    } else if (dto.leadUserId !== undefined && hasOrgWideProjectAccess(user.role)) {
      const leadUserId = project.leadUserId ?? user.sub;
      const currentMemberIds = (project.members ?? []).map((entry) => entry.userId);
      const memberIds = await this.resolveProjectMemberIds(
        project.organizationId,
        leadUserId,
        currentMemberIds,
      );

      await this.syncProjectMembers(project.id, memberIds, leadUserId, false);
    }

    return this.getProject(user, project.id);
  }

  async deleteProject(user: JwtPayload, projectId: string) {
    const project = await this.getAccessibleProject(user, projectId, true);
    const membership = this.findMembership(project.members ?? [], user.sub);

    if (!canDeleteProject(user, membership, project.createdById)) {
      throw new ForbiddenException('You do not have permission to delete this project.');
    }

    await this.projectMemberRepository.delete({ projectId: project.id });
    await this.projectRepository.delete(project.id);
    await this.decrementOrganizationProjectCount(project.organizationId);

    return {
      message: `${project.name} deleted successfully.`,
    };
  }

  async listAssignableMembers(
    user: JwtPayload,
    query: ListAssignableMembersQueryDto = {},
  ): Promise<PaginatedResponse<ReturnType<typeof mapAssignableProjectMember>>> {
    const users = await this.findAssignableUsers(user);
    const mapped = users.map(mapAssignableProjectMember);
    return paginateArray(mapped, query);
  }

  async resolveAccessibleProjectIds(user: JwtPayload) {
    if (hasOrgWideProjectAccess(user.role)) {
      const projects = await this.projectRepository.find({
        where: { organizationId: user.organizationId! },
        select: { id: true },
      });

      return projects.map((project) => project.id);
    }

    return this.getMembershipProjectIds(user);
  }

  private async getMembershipProjectIds(user: JwtPayload) {
    const rows = await this.projectMemberRepository
      .createQueryBuilder('membership')
      .innerJoin('membership.project', 'project')
      .where('membership.user_id = :userId', { userId: user.sub })
      .andWhere('project.organization_id = :organizationId', {
        organizationId: user.organizationId,
      })
      .select('membership.project_id', 'projectId')
      .getRawMany<{ projectId: string }>();

    return rows.map((row) => row.projectId);
  }

  async getSquadUserIds(user: JwtPayload) {
    if (hasOrgWideProjectAccess(user.role)) {
      const organization = await this.organizationRepository.findOne({
        where: { id: user.organizationId! },
        relations: { users: true },
      });

      return new Set((organization?.users ?? []).map((member) => member.id));
    }

    const projectIds = await this.resolveAccessibleProjectIds(user);

    if (projectIds.length === 0) {
      return new Set([user.sub]);
    }

    const memberships = await this.projectMemberRepository.find({
      where: { projectId: In(projectIds) },
      select: { userId: true },
    });

    const squadIds = new Set(memberships.map((membership) => membership.userId));
    squadIds.add(user.sub);

    return squadIds;
  }

  async countProjectMembershipsByUserIds(
    organizationId: string,
    userIds: string[],
  ) {
    const counts = new Map<string, number>();

    for (const userId of userIds) {
      counts.set(userId, 0);
    }

    if (userIds.length === 0) {
      return counts;
    }

    const rows = await this.projectMemberRepository
      .createQueryBuilder('membership')
      .innerJoin('membership.project', 'project')
      .select('membership.user_id', 'userId')
      .addSelect('COUNT(DISTINCT membership.project_id)', 'projectCount')
      .where('project.organization_id = :organizationId', { organizationId })
      .andWhere('membership.user_id IN (:...userIds)', { userIds })
      .groupBy('membership.user_id')
      .getRawMany<{ userId: string; projectCount: string }>();

    for (const row of rows) {
      counts.set(row.userId, Number(row.projectCount ?? 0));
    }

    return counts;
  }

  async countProjectMembershipsForUser(
    organizationId: string,
    userId: string,
  ) {
    const counts = await this.countProjectMembershipsByUserIds(organizationId, [
      userId,
    ]);

    return counts.get(userId) ?? 0;
  }

  async getMemberProjectTaskBreakdown(
    actor: JwtPayload,
    memberUserId: string,
  ): Promise<TeamMemberProjectDetail[]> {
    const organizationId = actor.organizationId!;

    const memberships = await this.projectMemberRepository.find({
      where: { userId: memberUserId },
      relations: { project: true },
    });

    let visibleMemberships = memberships.filter(
      (membership) => membership.project?.organizationId === organizationId,
    );

    if (!hasOrgWideProjectAccess(actor.role)) {
      const accessibleProjectIds = new Set(
        await this.resolveAccessibleProjectIds(actor),
      );
      visibleMemberships = visibleMemberships.filter((membership) =>
        accessibleProjectIds.has(membership.projectId),
      );
    }

    if (visibleMemberships.length === 0) {
      return [];
    }

    const projectIds = visibleMemberships.map((membership) => membership.projectId);

    const taskRows = await this.taskRepository
      .createQueryBuilder('task')
      .select('task.project_id', 'projectId')
      .addSelect('COUNT(*)', 'assignedTasks')
      .addSelect(
        'SUM(CASE WHEN task.status = :doneStatus THEN 1 ELSE 0 END)',
        'completedTasks',
      )
      .where('task.organization_id = :organizationId', { organizationId })
      .andWhere('task.assignee_id = :memberUserId', { memberUserId })
      .andWhere('task.project_id IN (:...projectIds)', { projectIds })
      .setParameter('doneStatus', TaskStatus.DONE)
      .groupBy('task.project_id')
      .getRawMany<{
        projectId: string;
        assignedTasks: string;
        completedTasks: string;
      }>();

    const taskCountsByProjectId = new Map(
      taskRows.map((row) => [
        row.projectId,
        {
          assignedTasks: Number(row.assignedTasks ?? 0),
          completedTasks: Number(row.completedTasks ?? 0),
        },
      ]),
    );

    return visibleMemberships
      .map((membership) => {
        const counts = taskCountsByProjectId.get(membership.projectId) ?? {
          assignedTasks: 0,
          completedTasks: 0,
        };

        return {
          projectId: membership.projectId,
          projectKey: membership.project.key,
          projectName: membership.project.name,
          projectRole: membership.role,
          assignedTasks: counts.assignedTasks,
          completedTasks: counts.completedTasks,
        };
      })
      .sort((left, right) => left.projectName.localeCompare(right.projectName));
  }

  async getProjectManagersForMember(memberUserId: string, organizationId: string) {
    const memberships = await this.projectMemberRepository.find({
      where: { userId: memberUserId },
      select: { projectId: true },
    });

    if (memberships.length === 0) {
      return [];
    }

    const projectIds = memberships.map((membership) => membership.projectId);
    const projects = await this.projectRepository.find({
      where: {
        id: In(projectIds),
        organizationId,
      },
      relations: { leadUser: true },
    });

    const managers = new Map<string, User>();

    for (const project of projects) {
      const lead = project.leadUser;

      if (
        lead &&
        lead.role === RegisterAs.MANAGER &&
        lead.accountStatus === AccountStatus.ACTIVE &&
        lead.organizationId === organizationId
      ) {
        managers.set(lead.id, lead);
      }
    }

    return [...managers.values()].sort((left, right) =>
      left.fullName.localeCompare(right.fullName),
    );
  }

  async listProjectMembers(
    user: JwtPayload,
    projectId: string,
    query: ListProjectMembersQueryDto = {},
  ) {
    const project = await this.getAccessibleProject(user, projectId);
    const members = (project.members ?? []).map((membership) => ({
      ...mapAssignableProjectMember(membership.user),
      projectRole: membership.role,
    }));

    return paginateArray(members, query);
  }

  async addProjectMember(
    user: JwtPayload,
    projectId: string,
    dto: AddProjectMemberDto,
  ) {
    const project = await this.getAccessibleProject(user, projectId, true);
    const actorMembership = this.findMembership(project.members ?? [], user.sub);

    if (!canManageProjectMembership(user, actorMembership)) {
      throw new ForbiddenException('You do not have permission to manage project members.');
    }

    await this.ensureActiveOrganizationUser(project.organizationId, dto.userId);

    const existing = await this.projectMemberRepository.findOne({
      where: { projectId, userId: dto.userId },
    });

    if (existing) {
      throw new ConflictException('This user is already a member of the project.');
    }

    await this.projectMemberRepository.save(
      this.projectMemberRepository.create({
        projectId,
        userId: dto.userId,
        role: dto.role ?? ProjectMemberRole.MEMBER,
      }),
    );

    const actorName = await this.getUserDisplayName(user.sub);
    void this.notificationsService.notifyProjectMembership({
      organizationId: project.organizationId,
      projectId: project.id,
      projectName: project.name,
      actorUserId: user.sub,
      actorName,
      memberUserIds: [dto.userId],
    });

    return this.listProjectMembers(user, projectId);
  }

  async updateProjectMemberRole(
    user: JwtPayload,
    projectId: string,
    memberUserId: string,
    dto: UpdateProjectMemberRoleDto,
  ) {
    const project = await this.getAccessibleProject(user, projectId, true);
    const actorMembership = this.findMembership(project.members ?? [], user.sub);

    if (!canManageProjectMembership(user, actorMembership)) {
      throw new ForbiddenException('You do not have permission to manage project members.');
    }

    const membership = await this.projectMemberRepository.findOne({
      where: { projectId, userId: memberUserId },
    });

    if (!membership) {
      throw new NotFoundException('Project member not found.');
    }

    if (project.leadUserId === memberUserId && dto.role !== ProjectMemberRole.ADMIN) {
      throw new BadRequestException('Project lead must remain a project admin.');
    }

    membership.role = dto.role;
    await this.projectMemberRepository.save(membership);

    return this.listProjectMembers(user, projectId);
  }

  async removeProjectMember(
    user: JwtPayload,
    projectId: string,
    memberUserId: string,
  ) {
    const project = await this.getAccessibleProject(user, projectId, true);
    const actorMembership = this.findMembership(project.members ?? [], user.sub);

    if (!canManageProjectMembership(user, actorMembership)) {
      throw new ForbiddenException('You do not have permission to manage project members.');
    }

    if (memberUserId === project.leadUserId) {
      throw new BadRequestException('Project lead cannot be removed from the project.');
    }

    await this.projectMemberRepository.delete({ projectId, userId: memberUserId });

    return this.listProjectMembers(user, projectId);
  }

  async removeUserFromManagedProjects(
    actor: JwtPayload,
    memberUserId: string,
  ) {
    if (hasOrgWideProjectAccess(actor.role)) {
      throw new BadRequestException(
        'Use organization member management to remove workspace members.',
      );
    }

    if (actor.role !== RegisterAs.MANAGER) {
      throw new ForbiddenException('Only managers can remove members from their team.');
    }

    if (actor.sub === memberUserId) {
      throw new BadRequestException('You cannot remove yourself from the team.');
    }

    const member = await this.userRepository.findOne({
      where: { id: memberUserId, organizationId: actor.organizationId! },
    });

    if (!member) {
      throw new NotFoundException('Team member not found.');
    }

    if (
      member.role === RegisterAs.OWNER ||
      member.role === RegisterAs.ADMIN ||
      member.role === RegisterAs.MANAGER
    ) {
      throw new ForbiddenException('You cannot remove this member from your team.');
    }

    const managedProjectIds = await this.getManagedProjectIds(actor);

    if (managedProjectIds.length === 0) {
      throw new BadRequestException('You do not manage any projects yet.');
    }

    const projects = await this.projectRepository.find({
      where: { id: In(managedProjectIds) },
      select: { id: true, leadUserId: true },
    });

    let removedCount = 0;

    for (const project of projects) {
      if (project.leadUserId === memberUserId) {
        continue;
      }

      const result = await this.projectMemberRepository.delete({
        projectId: project.id,
        userId: memberUserId,
      });

      removedCount += result.affected ?? 0;
    }

    if (removedCount === 0) {
      throw new BadRequestException(
        'This member is not assigned to any project you manage.',
      );
    }

    return {
      message: `${member.fullName} removed from your team.`,
      removedFromProjects: removedCount,
    };
  }

  private async getManagedProjectIds(user: JwtPayload) {
    const projectIds = await this.resolveAccessibleProjectIds(user);

    if (projectIds.length === 0) {
      return [];
    }

    const projects = await this.projectRepository.find({
      where: { id: In(projectIds) },
      relations: { members: true },
    });

    return projects
      .filter((project) => {
        if (project.leadUserId === user.sub) {
          return true;
        }

        const membership = this.findMembership(project.members ?? [], user.sub);
        return membership?.role === ProjectMemberRole.ADMIN;
      })
      .map((project) => project.id);
  }

  private async findAccessibleProjects(user: JwtPayload) {
    const organizationId = user.organizationId!;

    if (hasOrgWideProjectAccess(user.role)) {
      return this.projectRepository.find({
        where: { organizationId },
        relations: { members: { user: true } },
        order: { updatedAt: 'DESC' },
      });
    }

    const projectIds = await this.resolveAccessibleProjectIds(user);

    if (projectIds.length === 0) {
      return [];
    }

    return this.projectRepository.find({
      where: { id: In(projectIds), organizationId },
      relations: { members: { user: true } },
      order: { updatedAt: 'DESC' },
    });
  }

  private async findAccessibleProjectsPaginated(
    user: JwtPayload,
    skip: number,
    take: number,
  ): Promise<[Project[], number]> {
    const organizationId = user.organizationId!;

    if (hasOrgWideProjectAccess(user.role)) {
      return this.projectRepository.findAndCount({
        where: { organizationId },
        relations: { members: { user: true } },
        order: { updatedAt: 'DESC' },
        skip,
        take,
      });
    }

    const projectIds = await this.resolveAccessibleProjectIds(user);

    if (projectIds.length === 0) {
      return [[], 0];
    }

    return this.projectRepository.findAndCount({
      where: { id: In(projectIds), organizationId },
      relations: { members: { user: true } },
      order: { updatedAt: 'DESC' },
      skip,
      take,
    });
  }

  async ensureAccessibleProject(
    user: JwtPayload,
    projectId: string,
    forWrite = false,
  ) {
    return this.getAccessibleProject(user, projectId, forWrite);
  }

  private async getAccessibleProject(
    user: JwtPayload,
    projectId: string,
    forWrite = false,
  ) {
    const project = await this.projectRepository.findOne({
      where: { id: projectId, organizationId: user.organizationId! },
      relations: { members: { user: true } },
    });

    if (!project) {
      throw new NotFoundException('Project not found.');
    }

    if (hasOrgWideProjectAccess(user.role)) {
      return project;
    }

    const membership = this.findMembership(project.members ?? [], user.sub);

    if (!membership) {
      throw new ForbiddenException('You do not have access to this project.');
    }

    if (
      forWrite &&
      membership.role === ProjectMemberRole.VIEWER &&
      !canManageProjectMembership(user, membership)
    ) {
      throw new ForbiddenException('Viewers cannot modify this project.');
    }

    return project;
  }

  private async findAssignableUsers(user: JwtPayload) {
    const organization = await this.organizationRepository.findOne({
      where: { id: user.organizationId! },
      relations: { users: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    const activeUsers = (organization.users ?? []).filter(
      (member) => member.accountStatus !== AccountStatus.SUSPENDED,
    );

    if (hasOrgWideProjectAccess(user.role)) {
      return activeUsers.filter((member) => member.role !== RegisterAs.SUPER_ADMIN);
    }

    return activeUsers.filter(
      (member) =>
        member.role === RegisterAs.MEMBER ||
        member.role === RegisterAs.MANAGER ||
        member.role === RegisterAs.ADMIN,
    );
  }

  private async resolveProjectMemberIds(
    organizationId: string,
    leadUserId: string,
    memberIds: string[],
  ) {
    const uniqueIds = new Set(memberIds.filter(Boolean));
    uniqueIds.add(leadUserId);

    for (const memberId of uniqueIds) {
      await this.ensureActiveOrganizationUser(organizationId, memberId);
    }

    return [...uniqueIds];
  }

  private async resolveProjectLeadUserId(
    user: JwtPayload,
    organizationId: string,
    requestedLeadUserId?: string,
  ) {
    if (user.role === RegisterAs.MANAGER) {
      return user.sub;
    }

    if (user.role === RegisterAs.OWNER) {
      if (!requestedLeadUserId) {
        throw new BadRequestException(
          'Select a delivery lead (manager or admin) for this project.',
        );
      }

      return this.validateOperationalLead(organizationId, requestedLeadUserId);
    }

    if (user.role === RegisterAs.ADMIN) {
      if (!requestedLeadUserId) {
        return user.sub;
      }

      return this.validateOperationalLead(organizationId, requestedLeadUserId);
    }

    return user.sub;
  }

  private async validateOperationalLead(
    organizationId: string,
    leadUserId: string,
  ) {
    await this.ensureActiveOrganizationUser(organizationId, leadUserId);

    const leadUser = await this.userRepository.findOne({
      where: { id: leadUserId, organizationId },
    });

    if (!leadUser || !isOperationalProjectLeadRole(leadUser.role)) {
      throw new BadRequestException(
        'Project lead must be a manager or admin in your organization.',
      );
    }

    return leadUserId;
  }

  private async syncProjectMembers(
    projectId: string,
    memberIds: string[],
    leadUserId: string,
    isCreate: boolean,
  ): Promise<string[]> {
    const addedUserIds: string[] = [];
    const existing = await this.projectMemberRepository.find({
      where: { projectId },
    });

    const nextIds = new Set(memberIds);
    nextIds.add(leadUserId);

    for (const membership of existing) {
      if (!nextIds.has(membership.userId)) {
        if (membership.userId === leadUserId) continue;
        await this.projectMemberRepository.delete(membership.id);
      }
    }

    for (const userId of nextIds) {
      const current = existing.find((membership) => membership.userId === userId);

      if (current) {
        if (userId === leadUserId && current.role !== ProjectMemberRole.ADMIN) {
          current.role = ProjectMemberRole.ADMIN;
          await this.projectMemberRepository.save(current);
        }
        continue;
      }

      await this.projectMemberRepository.save(
        this.projectMemberRepository.create({
          projectId,
          userId,
          role:
            userId === leadUserId
              ? ProjectMemberRole.ADMIN
              : ProjectMemberRole.MEMBER,
        }),
      );
      addedUserIds.push(userId);
    }

    if (isCreate) {
      const leadMembership = await this.projectMemberRepository.findOne({
        where: { projectId, userId: leadUserId },
      });

      if (leadMembership && leadMembership.role !== ProjectMemberRole.ADMIN) {
        leadMembership.role = ProjectMemberRole.ADMIN;
        await this.projectMemberRepository.save(leadMembership);
      }
    }

    return addedUserIds;
  }

  private async getUserDisplayName(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    return user?.fullName ?? 'Someone';
  }

  private findMembership(memberships: ProjectMember[], userId: string) {
    return memberships.find((membership) => membership.userId === userId) ?? null;
  }

  private resolveViewerRole(
    user: JwtPayload,
    memberships: ProjectMember[],
    membership: ProjectMember | null = this.findMembership(memberships, user.sub),
  ): WorkspaceProjectResponse['viewerRole'] {
    if (hasOrgWideProjectAccess(user.role)) {
      return 'org_admin';
    }

    return membership?.role ?? null;
  }

  private async applyProjectStatusChange(
    user: JwtPayload,
    project: Project,
    nextStatus: ProjectStatus,
  ) {
    const isCompletionChange =
      nextStatus === ProjectStatus.COMPLETED ||
      project.status === ProjectStatus.COMPLETED;

    if (isCompletionChange && !canMarkProjectComplete(user.role)) {
      throw new ForbiddenException(
        'Only workspace owners, admins, or managers can mark a project as done.',
      );
    }

    if (nextStatus === ProjectStatus.COMPLETED) {
      await this.ensureAllProjectTasksCompleted(project.id);
    }

    project.status = nextStatus;
  }

  private async ensureAllProjectTasksCompleted(projectId: string) {
    const incompleteCount = await this.taskRepository.count({
      where: {
        projectId,
        status: Not(TaskStatus.DONE),
      },
    });

    if (incompleteCount > 0) {
      throw new BadRequestException(
        `Cannot mark project as done. ${incompleteCount} task(s) are still incomplete.`,
      );
    }
  }

  private async ensureUniqueProjectKey(
    organizationId: string,
    key: string,
    excludeId?: string,
  ) {
    const existing = await this.projectRepository.findOne({
      where: { organizationId, key },
    });

    if (existing && existing.id !== excludeId) {
      throw new ConflictException('A project with this key already exists.');
    }
  }

  private async ensureActiveOrganizationUser(
    organizationId: string,
    userId: string,
  ) {
    const member = await this.userRepository.findOne({
      where: { id: userId, organizationId },
    });

    if (!member || member.accountStatus === AccountStatus.SUSPENDED) {
      throw new BadRequestException('Invalid project member selected.');
    }
  }

  private async incrementOrganizationProjectCount(organizationId: string) {
    await this.organizationRepository.increment({ id: organizationId }, 'projectCount', 1);
  }

  private async decrementOrganizationProjectCount(organizationId: string) {
    await this.organizationRepository.decrement({ id: organizationId }, 'projectCount', 1);
  }

  private async loadProjectTaskStats(projectIds: string[]) {
    const stats = new Map<string, ProjectTaskStats>();

    if (projectIds.length === 0) {
      return stats;
    }

    const rows = await this.taskRepository
      .createQueryBuilder('task')
      .select('task.project_id', 'projectId')
      .addSelect(
        'SUM(CASE WHEN task.status = :done THEN 1 ELSE 0 END)',
        'completedTaskCount',
      )
      .addSelect('COALESCE(SUM(task.estimated_hours), 0)', 'totalEstimatedHours')
      .where('task.project_id IN (:...projectIds)', { projectIds })
      .groupBy('task.project_id')
      .setParameter('done', TaskStatus.DONE)
      .getRawMany<{
        projectId: string;
        completedTaskCount: string;
        totalEstimatedHours: string;
      }>();

    for (const row of rows) {
      stats.set(row.projectId, {
        completedTaskCount: Number(row.completedTaskCount ?? 0),
        totalEstimatedHours: Number(row.totalEstimatedHours ?? 0),
      });
    }

    return stats;
  }

  private async resolveViewerTheme(userId: string, projectId: string) {
    const preference = await this.projectUserThemeRepository.findOne({
      where: { userId, projectId },
    });

    return preference?.theme ?? ProjectTheme.CLASSIC;
  }

  private async loadUserThemesForProjects(userId: string, projectIds: string[]) {
    const themes = new Map<string, ProjectTheme>();

    if (projectIds.length === 0) {
      return themes;
    }

    const preferences = await this.projectUserThemeRepository.find({
      where: {
        userId,
        projectId: In(projectIds),
      },
    });

    for (const preference of preferences) {
      themes.set(preference.projectId, preference.theme);
    }

    return themes;
  }
}
