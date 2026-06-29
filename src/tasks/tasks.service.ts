import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import { unlink } from 'fs/promises';
import {
  buildTaskAttachmentStorageKey,
  getTaskAttachmentAbsolutePath,
} from './task-attachment.storage';
import {
  buildTaskStatusSlices,
  mapKanbanTask,
  mapTaskAttachmentResponse,
  mapWorkspaceTaskResponse,
} from '../common/mappers/task.mapper';
import { mapProjectMemberSummary as mapMemberSummary } from '../common/mappers/project.mapper';
import { Project } from '../entities/project.entity';
import { Task } from '../entities/task.entity';
import { TaskAttachment } from '../entities/task-attachment.entity';
import { User } from '../entities/user.entity';
import { AccountStatus, RegisterAs } from '../enum/auth.enum';
import { ProjectMemberRole } from '../enum/project.enum';
import { TaskPriority, TaskStatus } from '../enum/task.enum';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { ProjectsService } from '../projects/projects.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityAction, ActivityModule } from '../enum/activity.enum';
import {
  canDeleteAnyTask,
  canModifyTask,
  canViewAllOrganizationTasks,
} from './task-access.util';
import { CreateTaskDto, UpdateTaskDto } from './dto/task.dto';
import { ListTasksQueryDto } from './dto/task-list-query.dto';
import {
  buildPaginatedResponse,
  resolvePagination,
  type PaginatedResponse,
} from '../common/dto/pagination-query.dto';

const KANBAN_COLUMNS: Array<{
  id: string;
  title: string;
  statuses: TaskStatus[];
}> = [
  { id: 'todo', title: 'TODO', statuses: [TaskStatus.TODO] },
  {
    id: 'in-progress',
    title: 'IN PROGRESS',
    statuses: [TaskStatus.IN_PROGRESS],
  },
  { id: 'review', title: 'REVIEW', statuses: [TaskStatus.REVIEW] },
  { id: 'done', title: 'DONE', statuses: [TaskStatus.DONE] },
];

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(TaskAttachment)
    private readonly taskAttachmentRepository: Repository<TaskAttachment>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly projectsService: ProjectsService,
    private readonly activityService: ActivityService,
  ) {}

  async listTasks(
    user: JwtPayload,
    query: ListTasksQueryDto = {},
  ): Promise<PaginatedResponse<ReturnType<typeof mapWorkspaceTaskResponse>>> {
    const { page, limit, skip, take } = resolvePagination(query);
    const [tasks, total] = await this.findAccessibleTasksPaginated(user, {
      skip,
      take,
    });

    return buildPaginatedResponse(
      tasks.map(mapWorkspaceTaskResponse),
      total,
      page,
      limit,
    );
  }

  async listMyTasks(
    user: JwtPayload,
    query: ListTasksQueryDto = {},
  ): Promise<PaginatedResponse<ReturnType<typeof mapWorkspaceTaskResponse>>> {
    const { page, limit, skip, take } = resolvePagination(query);
    const [tasks, total] = await this.findAccessibleTasksPaginated(user, {
      assigneeOnly: true,
      skip,
      take,
    });

    return buildPaginatedResponse(
      tasks.map(mapWorkspaceTaskResponse),
      total,
      page,
      limit,
    );
  }

  async getTask(user: JwtPayload, taskId: string) {
    const task = await this.getAccessibleTask(user, taskId);
    return mapWorkspaceTaskResponse(task);
  }

  async createTask(user: JwtPayload, dto: CreateTaskDto) {
    if (user.role === RegisterAs.OWNER) {
      throw new ForbiddenException(
        'Organization owners oversee delivery but cannot create tasks. Ask your delivery lead or admin.',
      );
    }

    const project = await this.projectsService.ensureAccessibleProject(
      user,
      dto.projectId,
      true,
    );

    if (dto.assigneeId) {
      await this.ensureAssignableUser(user, dto.assigneeId, project);
    }

    const taskNumber = await this.getNextTaskNumber(project.id);

    const task = await this.taskRepository.save(
      this.taskRepository.create({
        organizationId: user.organizationId!,
        projectId: project.id,
        taskNumber,
        title: dto.title.trim(),
        description: dto.description?.trim() ?? '',
        status: dto.status ?? TaskStatus.TODO,
        priority: dto.priority ?? TaskPriority.MEDIUM,
        assigneeId: dto.assigneeId ?? null,
        createdById: user.sub,
        dueDate: dto.dueDate ?? null,
        estimatedHours: dto.estimatedHours ?? null,
        labels: dto.labels ?? [],
      }),
    );

    await this.syncProjectTaskMetrics(project.id);

    await this.activityService.recordForUser(user, {
      module: ActivityModule.TASKS,
      action: ActivityAction.CREATED,
      summary: `Created task ${task.title}`,
      targetLabel: task.title,
      resourceType: 'task',
      resourceId: task.id,
      projectId: project.id,
    });

    return this.getTask(user, task.id);
  }

  async updateTask(user: JwtPayload, taskId: string, dto: UpdateTaskDto) {
    const task = await this.getAccessibleTask(user, taskId, true);

    if (!canModifyTask(user, task)) {
      throw new ForbiddenException('You do not have permission to edit this task.');
    }

    const previousStatus = task.status;

    if (dto.title !== undefined) {
      task.title = dto.title.trim();
    }

    if (dto.description !== undefined) {
      task.description = dto.description.trim();
    }

    if (dto.status !== undefined) {
      task.status = dto.status;
    }

    if (dto.priority !== undefined) {
      task.priority = dto.priority;
    }

    if (dto.dueDate !== undefined) {
      task.dueDate = dto.dueDate;
    }

    if (dto.assigneeId !== undefined) {
      if (dto.assigneeId) {
        await this.ensureAssignableUser(user, dto.assigneeId, task.project);
      }

      task.assigneeId = dto.assigneeId;
    }

    if (dto.estimatedHours !== undefined) {
      task.estimatedHours = dto.estimatedHours;
    }

    if (dto.labels !== undefined) {
      task.labels = dto.labels;
    }

    await this.taskRepository.save(task);
    await this.syncProjectTaskMetrics(task.projectId);

    const statusChanged =
      dto.status !== undefined && dto.status !== previousStatus;

    await this.activityService.recordForUser(user, {
      module: ActivityModule.TASKS,
      action: statusChanged ? ActivityAction.STATUS_CHANGED : ActivityAction.UPDATED,
      summary: statusChanged
        ? `Changed status of ${task.title}`
        : `Updated task ${task.title}`,
      targetLabel: task.title,
      resourceType: 'task',
      resourceId: task.id,
      projectId: task.projectId,
      metadata: statusChanged
        ? { fromStatus: previousStatus, toStatus: task.status }
        : null,
    });

    return this.getTask(user, task.id);
  }

  async uploadAttachment(
    user: JwtPayload,
    taskId: string,
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Attachment file is required.');
    }

    const task = await this.getAccessibleTask(user, taskId, true);

    if (!canModifyTask(user, task)) {
      throw new ForbiddenException('You do not have permission to edit this task.');
    }

    const storageKey = buildTaskAttachmentStorageKey(taskId, file.filename);
    const attachment = await this.taskAttachmentRepository.save(
      this.taskAttachmentRepository.create({
        taskId: task.id,
        organizationId: user.organizationId!,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        storageKey,
      }),
    );

    return mapTaskAttachmentResponse(attachment);
  }

  async deleteAttachment(
    user: JwtPayload,
    taskId: string,
    attachmentId: string,
  ) {
    const task = await this.getAccessibleTask(user, taskId, true);

    if (!canModifyTask(user, task)) {
      throw new ForbiddenException('You do not have permission to edit this task.');
    }

    const attachment = await this.taskAttachmentRepository.findOne({
      where: {
        id: attachmentId,
        taskId: task.id,
        organizationId: user.organizationId!,
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found.');
    }

    await this.removeAttachmentFile(attachment);
    await this.taskAttachmentRepository.delete(attachment.id);

    return { message: 'Attachment removed successfully.' };
  }

  async deleteTask(user: JwtPayload, taskId: string) {
    const task = await this.getAccessibleTask(user, taskId, true);

    if (!canDeleteAnyTask(user) && !canModifyTask(user, task)) {
      throw new ForbiddenException('You do not have permission to delete this task.');
    }

    const projectId = task.projectId;
    const taskTitle = task.title;
    const attachments = await this.taskAttachmentRepository.find({
      where: { taskId: task.id },
    });

    for (const attachment of attachments) {
      await this.removeAttachmentFile(attachment);
    }

    await this.taskRepository.delete(task.id);
    await this.syncProjectTaskMetrics(projectId);

    await this.activityService.recordForUser(user, {
      module: ActivityModule.TASKS,
      action: ActivityAction.DELETED,
      summary: `Deleted task ${taskTitle}`,
      targetLabel: taskTitle,
      resourceType: 'task',
      resourceId: taskId,
      projectId,
    });

    return {
      message: `${task.project?.key ?? 'TASK'}-${task.taskNumber} deleted successfully.`,
    };
  }

  async getDashboard(user: JwtPayload) {
    const [projects, tasks, squadIds] = await Promise.all([
      this.findAccessibleProjects(user),
      this.findAccessibleTasks(user),
      this.projectsService.getSquadUserIds(user),
    ]);

    const activeTasks = tasks.filter((task) => task.status !== TaskStatus.DONE);
    const completedTasks = tasks.filter((task) => task.status === TaskStatus.DONE);

    const isOwnerDashboard = user.role === RegisterAs.OWNER;
    const memberCount = isOwnerDashboard
      ? await this.countOrganizationMembersExcludingOwner(user.organizationId!)
      : squadIds.size;

    const metrics = [
      {
        id: 'total-projects',
        label: 'Total Projects',
        value: String(projects.length),
        trend: projects.length > 0 ? 'In your scope' : 'No projects yet',
        trendType: 'stable' as const,
        icon: 'projects' as const,
        iconBg: 'bg-indigo-50',
      },
      {
        id: 'active-tasks',
        label: 'Active Tasks',
        value: String(activeTasks.length),
        trend: `${tasks.length} total`,
        trendType: 'up' as const,
        icon: 'tasks' as const,
        iconBg: 'bg-sky-50',
      },
      {
        id: 'team-members',
        label: isOwnerDashboard ? 'Total Members' : 'Team Members',
        value: String(memberCount),
        trend: isOwnerDashboard ? 'In workspace' : 'In your squad',
        trendType: 'stable' as const,
        icon: 'team' as const,
        iconBg: 'bg-violet-50',
      },
      {
        id: 'completed-tasks',
        label: 'Completed Tasks',
        value: String(completedTasks.length),
        trend: tasks.length > 0 ? `${Math.round((completedTasks.length / tasks.length) * 100)}% done` : '0% done',
        trendType: 'up' as const,
        icon: 'completed' as const,
        iconBg: 'bg-emerald-50',
      },
    ];

    const velocity = this.buildVelocitySeries(completedTasks);
    const taskStatus = buildTaskStatusSlices(tasks);
    const activeProjects = projects.slice(0, 5).map((project) => ({
      id: project.id,
      name: project.name,
      updatedAt: project.updatedAt.toISOString(),
      progress: project.progress,
      iconBg: 'bg-indigo-50',
    }));
    const criticalDeadlines = tasks
      .filter((task) => task.dueDate && task.status !== TaskStatus.DONE)
      .sort((left, right) => (left.dueDate ?? '').localeCompare(right.dueDate ?? ''))
      .slice(0, 5)
      .map((task) => {
        const due = new Date(task.dueDate!);
        return {
          id: task.id,
          title: task.title,
          subtitle: task.project?.name ?? 'Project',
          month: due.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
          day: String(due.getDate()),
          priority:
            task.priority === TaskPriority.CRITICAL || task.priority === TaskPriority.HIGH
              ? ('high' as const)
              : undefined,
        };
      });

    const activity = await this.activityService.getFeed(user, 5);

    return {
      metrics,
      velocity,
      taskStatus,
      activeProjects,
      criticalDeadlines,
      activity,
    };
  }

  async getReports(user: JwtPayload) {
    const [projects, tasks] = await Promise.all([
      this.findAccessibleProjects(user),
      this.findAccessibleTasks(user),
    ]);

    const completedTasks = tasks.filter((task) => task.status === TaskStatus.DONE);
    const overdueTasks = tasks.filter(
      (task) =>
        task.dueDate &&
        task.status !== TaskStatus.DONE &&
        new Date(task.dueDate) < new Date(),
    );

    const tasksByProject = projects.map((project) => {
      const projectTasks = tasks.filter((task) => task.projectId === project.id);
      return {
        projectId: project.id,
        projectName: project.name,
        total: projectTasks.length,
        completed: projectTasks.filter((task) => task.status === TaskStatus.DONE).length,
        inProgress: projectTasks.filter((task) => task.status === TaskStatus.IN_PROGRESS).length,
      };
    });

    const tasksByPriority = (Object.values(TaskPriority) as TaskPriority[]).map(
      (priority) => ({
        priority,
        count: tasks.filter((task) => task.priority === priority).length,
      }),
    );

    return {
      summary: {
        totalTasks: tasks.length,
        completedTasks: completedTasks.length,
        overdueTasks: overdueTasks.length,
        activeProjects: projects.length,
      },
      tasksByProject,
      tasksByPriority,
      taskStatus: buildTaskStatusSlices(tasks),
    };
  }

  async listBoards(user: JwtPayload) {
    const projects = await this.findAccessibleProjects(user);
    const tasks = await this.findAccessibleTasks(user);

    return projects.map((project) => {
      const projectTasks = tasks.filter((task) => task.projectId === project.id);
      const members = (project.members ?? [])
        .filter((membership) => membership.user)
        .map(mapMemberSummary);

      return {
        projectId: project.id,
        projectName: project.name,
        title: `${project.name} Board`,
        taskCount: projectTasks.length,
        inProgressCount: projectTasks.filter(
          (task) => task.status === TaskStatus.IN_PROGRESS,
        ).length,
        members,
      };
    });
  }

  async getBoard(user: JwtPayload, projectId: string) {
    const project = await this.projectsService.ensureAccessibleProject(user, projectId);
    const tasks = await this.findAccessibleTasks(user, { projectId: project.id });
    const members = (project.members ?? [])
      .filter((membership) => membership.user)
      .map(mapMemberSummary);

    return {
      id: `${project.id}-board`,
      projectId: project.id,
      projectName: project.name,
      title: `${project.name} Board`,
      teamMembers: members.map((member) => ({
        id: member.id,
        name: member.name,
        role: member.projectRole === ProjectMemberRole.ADMIN ? 'Project Lead' : 'Team Member',
        avatarColor: member.avatarColor,
      })),
      columns: KANBAN_COLUMNS.map((column) => ({
        id: column.id,
        title: column.title,
        tasks: tasks
          .filter((task) => column.statuses.includes(task.status))
          .map(mapKanbanTask),
      })),
    };
  }

  private async findAccessibleTasksPaginated(
    user: JwtPayload,
    options: {
      assigneeOnly?: boolean;
      projectId?: string;
      skip: number;
      take: number;
    },
  ): Promise<[Task[], number]> {
    const projectIds = await this.projectsService.resolveAccessibleProjectIds(user);

    if (projectIds.length === 0) {
      return [[], 0];
    }

    const scopedProjectIds = options.projectId
      ? projectIds.includes(options.projectId)
        ? [options.projectId]
        : []
      : projectIds;

    if (scopedProjectIds.length === 0) {
      return [[], 0];
    }

    const query = this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.project', 'project')
      .leftJoinAndSelect('task.assignee', 'assignee')
      .leftJoinAndSelect('task.attachments', 'attachments')
      .where('task.organization_id = :organizationId', {
        organizationId: user.organizationId,
      })
      .andWhere('task.project_id IN (:...projectIds)', {
        projectIds: scopedProjectIds,
      })
      .orderBy('task.updated_at', 'DESC')
      .skip(options.skip)
      .take(options.take);

    if (options.assigneeOnly || !canViewAllOrganizationTasks(user.role)) {
      query.andWhere('task.assignee_id = :assigneeId', { assigneeId: user.sub });
    }

    return query.getManyAndCount();
  }

  private async findAccessibleTasks(
    user: JwtPayload,
    options: { assigneeOnly?: boolean; projectId?: string } = {},
  ) {
    const projectIds = await this.projectsService.resolveAccessibleProjectIds(user);

    if (projectIds.length === 0) {
      return [];
    }

    const scopedProjectIds = options.projectId
      ? projectIds.includes(options.projectId)
        ? [options.projectId]
        : []
      : projectIds;

    if (scopedProjectIds.length === 0) {
      return [];
    }

    const query = this.taskRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.project', 'project')
      .leftJoinAndSelect('task.assignee', 'assignee')
      .leftJoinAndSelect('task.attachments', 'attachments')
      .where('task.organization_id = :organizationId', {
        organizationId: user.organizationId,
      })
      .andWhere('task.project_id IN (:...projectIds)', {
        projectIds: scopedProjectIds,
      })
      .orderBy('task.updated_at', 'DESC');

    if (options.assigneeOnly || !canViewAllOrganizationTasks(user.role)) {
      query.andWhere('task.assignee_id = :assigneeId', { assigneeId: user.sub });
    }

    return query.getMany();
  }

  private async findAccessibleProjects(user: JwtPayload) {
    const projectIds = await this.projectsService.resolveAccessibleProjectIds(user);

    if (projectIds.length === 0) {
      return [];
    }

    return this.projectRepository.find({
      where: { id: In(projectIds), organizationId: user.organizationId! },
      relations: { members: { user: true } },
      order: { updatedAt: 'DESC' },
    });
  }

  private async getAccessibleTask(
    user: JwtPayload,
    taskId: string,
    forWrite = false,
  ) {
    const task = await this.taskRepository.findOne({
      where: { id: taskId, organizationId: user.organizationId! },
      relations: {
        project: { members: { user: true } },
        assignee: true,
        attachments: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found.');
    }

    await this.projectsService.ensureAccessibleProject(
      user,
      task.projectId,
      forWrite,
    );

    if (!canViewAllOrganizationTasks(user.role) && task.assigneeId !== user.sub) {
      throw new ForbiddenException('You do not have access to this task.');
    }

    return task;
  }

  private async getNextTaskNumber(projectId: string) {
    const latest = await this.taskRepository.findOne({
      where: { projectId },
      order: { taskNumber: 'DESC' },
      select: { taskNumber: true },
    });

    return (latest?.taskNumber ?? 0) + 1;
  }

  private async ensureAssignableUser(
    user: JwtPayload,
    assigneeId: string,
    project: Project,
  ) {
    const assignable = await this.projectsService.listAssignableMembers(user);
    const allowedIds = new Set([
      ...assignable.data.map((member) => member.id),
      ...(project.members ?? []).map((membership) => membership.userId),
    ]);

    if (!allowedIds.has(assigneeId)) {
      throw new BadRequestException('Assignee must belong to your project squad.');
    }

    const assignee = await this.userRepository.findOne({
      where: {
        id: assigneeId,
        organizationId: user.organizationId!,
        accountStatus: AccountStatus.ACTIVE,
      },
    });

    if (!assignee) {
      throw new BadRequestException('Assignee is not an active workspace member.');
    }
  }

  private async countOrganizationMembersExcludingOwner(organizationId: string) {
    return this.userRepository.count({
      where: {
        organizationId,
        role: Not(RegisterAs.OWNER),
        accountStatus: Not(AccountStatus.SUSPENDED),
      },
    });
  }

  private async syncProjectTaskMetrics(projectId: string) {
    const tasks = await this.taskRepository.find({ where: { projectId } });
    const total = tasks.length;
    const done = tasks.filter((task) => task.status === TaskStatus.DONE).length;
    const progress = total === 0 ? 0 : Math.round((done / total) * 100);

    await this.projectRepository.update(projectId, {
      taskCount: total,
      progress,
    });
  }

  private buildVelocitySeries(completedTasks: Task[]) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(today);
      date.setDate(date.getDate() - (6 - index));
      const key = date.toISOString().slice(0, 10);

      const completed = completedTasks.filter((task) => {
        const updated = task.updatedAt.toISOString().slice(0, 10);
        return updated === key;
      }).length;

      return {
        date: date.toLocaleDateString('en-US', { weekday: 'short' }),
        completed,
      };
    });
  }

  private async removeAttachmentFile(attachment: TaskAttachment) {
    try {
      await unlink(getTaskAttachmentAbsolutePath(attachment.storageKey));
    } catch {
      // Ignore missing files on disk.
    }
  }
}
