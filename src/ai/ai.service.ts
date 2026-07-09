import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActivityService } from '../activity/activity.service';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { RegisterAs } from '../enum/auth.enum';
import { TaskPriority, TaskStatus } from '../enum/task.enum';
import { Project } from '../entities/project.entity';
import { Task } from '../entities/task.entity';
import { Organization } from '../entities/organization.entity';
import { ProjectsService } from '../projects/projects.service';
import { TasksService } from '../tasks/tasks.service';
import { canOperateOnTasks } from '../tasks/task-access.util';
import { ContentModerationService } from '../common/services/content-moderation.service';
import { CursorProvider } from './providers/cursor.provider';
import { buildPrompt } from './prompts/prompt-builder';
import {
  ACTIVITY_DESCRIBE_PROMPT,
  ASK_WORKSPACE_PROMPT,
  CALENDAR_DRAFT_PROMPT,
  MEMBERSHIP_IMPACT_PROMPT,
  PROJECT_DRAFT_PROMPT,
  PROJECT_SUMMARY_PROMPT,
  TASK_DRAFT_PROMPT,
  TASK_TIP_PROMPT,
  WORK_BREAKDOWN_PROMPT,
} from './prompts/phase1.prompts';
import {
  extractJsonPayload,
  validateActivityDescribe,
  validateAskWorkspace,
  validateCalendarDraft,
  validateMembershipImpact,
  validateProjectFormDraft,
  validateProjectSummary,
  validateTaskFormDraft,
  validateTaskTip,
  validateWorkBreakdown,
} from './validators/ai-response.validator';
import type {
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

function canUseAiWorkBreakdown(role: RegisterAs | string | undefined) {
  return role === RegisterAs.ADMIN || role === RegisterAs.MANAGER;
}

function canUseAiProjectTools(role: RegisterAs | string | undefined) {
  return (
    role === RegisterAs.OWNER ||
    role === RegisterAs.ADMIN ||
    role === RegisterAs.MANAGER
  );
}

function canUseAiTaskDraft(role: RegisterAs | string | undefined) {
  return role === RegisterAs.ADMIN || role === RegisterAs.MANAGER;
}

function canUseAiActivityDescribe(role: RegisterAs | string | undefined) {
  return role === RegisterAs.OWNER || role === RegisterAs.ADMIN;
}

function formatCriteriaBlock(title: string, items: string[]) {
  if (!items.length) {
    return '';
  }

  return `\n\n## ${title}\n${items.map((item) => `- ${item}`).join('\n')}`;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(
    private readonly cursorProvider: CursorProvider,
    private readonly contentModerationService: ContentModerationService,
    private readonly projectsService: ProjectsService,
    private readonly tasksService: TasksService,
    private readonly activityService: ActivityService,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
  ) {}

  async generateWorkBreakdown(user: JwtPayload, dto: GenerateWorkBreakdownDto) {
    this.ensureWorkBreakdownAccess(user);
    await this.contentModerationService.assertCleanContent(user.sub, {
      requirement: dto.requirement,
    });

    const [organization, project] = await Promise.all([
      this.getOrganization(user.organizationId!),
      this.projectsService.ensureAccessibleProject(user, dto.projectId, true),
    ]);

    const prompt = buildPrompt(WORK_BREAKDOWN_PROMPT, {
      language: dto.language,
      workspaceName: organization.name,
      projectName: project.name,
      role: user.role,
      variables: {
        projectKey: project.key,
        requirement: dto.requirement.trim(),
      },
    });

    const raw = await this.cursorProvider.generateText(prompt);
    const draft = validateWorkBreakdown(this.parseAiJson(raw));

    return {
      message: 'AI work breakdown generated successfully.',
      draft,
    };
  }

  async generateProjectSummary(user: JwtPayload, dto: GenerateProjectSummaryDto) {
    this.ensureProjectToolsAccess(user);

    const [organization, project] = await Promise.all([
      this.getOrganization(user.organizationId!),
      this.projectsService.ensureAccessibleProject(user, dto.projectId, false),
    ]);

    const tasks = await this.taskRepository.find({
      where: {
        organizationId: user.organizationId!,
        projectId: project.id,
      },
      order: { updatedAt: 'DESC' },
      take: 100,
    });

    const completed = tasks.filter((task) => task.status === TaskStatus.DONE);
    const delayed = tasks.filter((task) => {
      if (!task.dueDate || task.status === TaskStatus.DONE) {
        return false;
      }

      return new Date(task.dueDate) < new Date();
    });
    const blockedLike = tasks.filter(
      (task) =>
        task.status === TaskStatus.REVIEW ||
        task.priority === TaskPriority.CRITICAL,
    );

    const projectContext = {
      project: {
        name: project.name,
        key: project.key,
        status: project.status,
        priority: project.priority,
        progress: project.progress,
        dueDate: project.dueDate,
        taskCount: project.taskCount,
      },
      metrics: {
        totalTasks: tasks.length,
        completedTasks: completed.length,
        delayedTasks: delayed.length,
        criticalOrReviewTasks: blockedLike.length,
      },
      completedTitles: completed.slice(0, 12).map((task) => task.title),
      delayedTitles: delayed.slice(0, 12).map((task) => task.title),
      openHighPriority: tasks
        .filter(
          (task) =>
            task.status !== TaskStatus.DONE &&
            (task.priority === TaskPriority.HIGH ||
              task.priority === TaskPriority.CRITICAL),
        )
        .slice(0, 12)
        .map((task) => ({
          title: task.title,
          priority: task.priority,
          status: task.status,
          dueDate: task.dueDate,
        })),
    };

    const prompt = buildPrompt(PROJECT_SUMMARY_PROMPT, {
      language: dto.language,
      workspaceName: organization.name,
      projectName: project.name,
      role: user.role,
      variables: {
        projectKey: project.key,
        projectContext: JSON.stringify(projectContext, null, 2),
      },
    });

    const raw = await this.cursorProvider.generateText(prompt);
    const draft = validateProjectSummary(this.parseAiJson(raw));

    return {
      message: 'AI project summary generated successfully.',
      draft,
      context: projectContext,
    };
  }

  async generateProjectDraft(user: JwtPayload, dto: GenerateProjectDraftDto) {
    this.ensureProjectToolsAccess(user);
    await this.contentModerationService.assertCleanContent(user.sub, {
      notes: dto.notes,
    });

    const organization = await this.getOrganization(user.organizationId!);
    const assignable = await this.projectsService.listAssignableMembers(user, {
      page: 1,
      limit: 100,
    });

    const membersForPrompt = assignable.data.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
    }));

    const prompt = buildPrompt(PROJECT_DRAFT_PROMPT, {
      language: dto.language,
      workspaceName: organization.name,
      role: user.role,
      variables: {
        projectName: dto.projectName?.trim() || '',
        notes: dto.notes.trim(),
        assignableMembers: JSON.stringify(membersForPrompt, null, 2),
      },
    });

    const raw = await this.cursorProvider.generateText(prompt);
    const draft = validateProjectFormDraft(this.parseAiJson(raw));
    const preferredName = dto.projectName?.trim();
    if (preferredName) {
      draft.name = preferredName;
    }
    const allowedIds = new Set(membersForPrompt.map((member) => member.id));

    let leadUserId = draft.leadUserId;
    if (leadUserId && !allowedIds.has(leadUserId)) {
      leadUserId = null;
    }

    if (user.role === RegisterAs.OWNER) {
      const admins = membersForPrompt.filter(
        (member) => member.role === RegisterAs.ADMIN,
      );
      if (!leadUserId || !admins.some((admin) => admin.id === leadUserId)) {
        leadUserId = admins[0]?.id ?? null;
      }

      return {
        message: 'AI project draft generated successfully.',
        draft: {
          ...draft,
          visibility: 'private' as const,
          leadUserId,
          memberIds: [],
        },
      };
    }

    const memberIds = draft.memberIds.filter(
      (memberId) =>
        allowedIds.has(memberId) &&
        memberId !== leadUserId &&
        memberId !== user.sub,
    );

    if (!leadUserId) {
      const preferred =
        membersForPrompt.find((member) => member.id === user.sub) ??
        membersForPrompt.find(
          (member) =>
            member.role === RegisterAs.ADMIN ||
            member.role === RegisterAs.MANAGER,
        );
      leadUserId = preferred?.id ?? null;
    }

    return {
      message: 'AI project draft generated successfully.',
      draft: {
        ...draft,
        visibility: 'private' as const,
        leadUserId,
        memberIds,
      },
    };
  }

  async generateTaskDraft(user: JwtPayload, dto: GenerateTaskDraftDto) {
    this.ensureTaskDraftAccess(user);
    await this.contentModerationService.assertCleanContent(user.sub, {
      notes: dto.notes,
      taskTitle: dto.taskTitle,
    });

    const [organization, project] = await Promise.all([
      this.getOrganization(user.organizationId!),
      this.projectsService.ensureAccessibleProject(user, dto.projectId, true),
    ]);

    const membersPage = await this.projectsService.listProjectMembers(
      user,
      dto.projectId,
      { page: 1, limit: 100 },
    );
    const membersForPrompt = membersPage.data.map((member) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.projectRole,
    }));

    const prompt = buildPrompt(TASK_DRAFT_PROMPT, {
      language: dto.language,
      workspaceName: organization.name,
      projectName: project.name,
      role: user.role,
      variables: {
        projectKey: project.key,
        taskTitle: dto.taskTitle?.trim() || '',
        notes: dto.notes.trim(),
        assignableMembers: JSON.stringify(membersForPrompt, null, 2),
      },
    });

    const raw = await this.cursorProvider.generateText(prompt);
    const draft = validateTaskFormDraft(this.parseAiJson(raw));
    const preferredTitle = dto.taskTitle?.trim();
    if (preferredTitle) {
      draft.title = preferredTitle;
    }

    const allowedIds = new Set(membersForPrompt.map((member) => member.id));
    if (draft.assigneeId && !allowedIds.has(draft.assigneeId)) {
      draft.assigneeId = null;
    }

    return {
      message: 'AI task draft generated successfully.',
      draft,
    };
  }

  async describeActivity(user: JwtPayload, dto: DescribeActivityDto) {
    this.ensureActivityDescribeAccess(user);

    const [organization, event] = await Promise.all([
      this.getOrganization(user.organizationId!),
      this.activityService.getVisibleActivity(user, dto.activityId),
    ]);

    const activityContext = JSON.stringify(
      {
        id: event.id,
        module: event.module,
        action: event.action,
        summary: event.summary,
        targetLabel: event.targetLabel,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        projectId: event.projectId,
        actorName: event.actorName,
        actorRole: event.actorRole,
        createdAt: event.createdAt,
        metadata: event.metadata,
      },
      null,
      2,
    );

    const prompt = buildPrompt(ACTIVITY_DESCRIBE_PROMPT, {
      language: dto.language,
      workspaceName: organization.name,
      role: user.role,
      variables: {
        activityContext,
      },
    });

    const raw = await this.cursorProvider.generateText(prompt);
    const draft = validateActivityDescribe(this.parseAiJson(raw));

    return {
      message: 'AI activity description generated successfully.',
      draft,
    };
  }

  async generateTaskTip(user: JwtPayload, dto: GenerateTaskTipDto) {
    if (!user.organizationId) {
      throw new ForbiddenException('Organization membership is required.');
    }

    const [organization, task] = await Promise.all([
      this.getOrganization(user.organizationId),
      this.tasksService.getTask(user, dto.taskId),
    ]);

    const isOverdue =
      Boolean(task.dueDate) &&
      task.status !== TaskStatus.DONE &&
      new Date(task.dueDate as string) < new Date();
    const isReview = task.status === TaskStatus.REVIEW;

    if (!isOverdue && !isReview) {
      throw new BadRequestException(
        'AI tips are available for overdue or in-review tasks.',
      );
    }

    const triggerReason = [
      isOverdue ? 'overdue' : null,
      isReview ? 'in_review' : null,
    ]
      .filter(Boolean)
      .join('+');

    const taskContext = JSON.stringify(
      {
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        dueDate: task.dueDate,
        projectName: task.project,
        assigneeName: task.assignee?.name ?? null,
        labels: task.labels,
      },
      null,
      2,
    );

    const prompt = buildPrompt(TASK_TIP_PROMPT, {
      language: dto.language,
      workspaceName: organization.name,
      role: user.role,
      variables: {
        taskContext,
        triggerReason,
      },
    });

    const raw = await this.cursorProvider.generateText(prompt);
    const draft = validateTaskTip(this.parseAiJson(raw));

    return {
      message: 'AI task tip generated successfully.',
      draft,
      triggerReason,
    };
  }

  async generateMembershipImpact(
    user: JwtPayload,
    dto: GenerateMembershipImpactDto,
  ) {
    this.ensureActivityDescribeAccess(user);
    await this.contentModerationService.assertCleanContent(user.sub, {
      changeContext: dto.changeContext,
    });

    const organization = await this.getOrganization(user.organizationId!);
    const prompt = buildPrompt(MEMBERSHIP_IMPACT_PROMPT, {
      language: dto.language,
      workspaceName: organization.name,
      role: user.role,
      variables: {
        changeType: dto.changeType.trim(),
        changeContext: dto.changeContext.trim(),
      },
    });

    const raw = await this.cursorProvider.generateText(prompt);
    const draft = validateMembershipImpact(this.parseAiJson(raw));

    return {
      message: 'AI membership impact generated successfully.',
      draft,
    };
  }

  async generateCalendarDraft(user: JwtPayload, dto: GenerateCalendarDraftDto) {
    this.ensureProjectToolsAccess(user);
    await this.contentModerationService.assertCleanContent(user.sub, {
      notes: dto.notes,
      preferredTitle: dto.preferredTitle,
    });

    const organization = await this.getOrganization(user.organizationId!);
    const prompt = buildPrompt(CALENDAR_DRAFT_PROMPT, {
      language: dto.language,
      workspaceName: organization.name,
      role: user.role,
      variables: {
        notes: dto.notes.trim(),
        preferredTitle: dto.preferredTitle?.trim() || '',
        projectName: dto.projectName?.trim() || '',
      },
    });

    const raw = await this.cursorProvider.generateText(prompt);
    const draft = validateCalendarDraft(this.parseAiJson(raw));

    if (dto.preferredTitle?.trim()) {
      draft.title = dto.preferredTitle.trim();
    }

    return {
      message: 'AI calendar draft generated successfully.',
      draft,
    };
  }

  async askWorkspace(user: JwtPayload, dto: AskWorkspaceDto) {
    this.ensureProjectToolsAccess(user);
    await this.contentModerationService.assertCleanContent(user.sub, {
      question: dto.question,
    });

    const organization = await this.getOrganization(user.organizationId!);

    const [projectsPage, tasks, activityFeed] = await Promise.all([
      this.projectsService.listProjects(user, { page: 1, limit: 12 }),
      this.taskRepository.find({
        where: { organizationId: user.organizationId! },
        order: { updatedAt: 'DESC' },
        take: 25,
      }),
      canUseAiActivityDescribe(user.role)
        ? this.activityService.getFeed(user, 15)
        : Promise.resolve([]),
    ]);

    const workspaceContext = JSON.stringify(
      {
        projects: projectsPage.data.map((project) => ({
          id: project.id,
          name: project.title,
          key: project.key,
          status: project.status,
          progress: project.progress,
          dueDate: project.dueDate,
          taskCount: project.taskCount,
        })),
        tasks: tasks.map((task) => ({
          id: task.id,
          title: task.title,
          status: task.status,
          priority: task.priority,
          dueDate: task.dueDate,
          projectId: task.projectId,
          updatedAt: task.updatedAt,
        })),
        recentActivity: activityFeed.map((item) => ({
          summary: item.action,
          target: item.target,
          userName: item.userName,
          module: item.module,
          createdAt: item.createdAt,
        })),
      },
      null,
      2,
    );

    const prompt = buildPrompt(ASK_WORKSPACE_PROMPT, {
      language: dto.language,
      workspaceName: organization.name,
      role: user.role,
      variables: {
        question: dto.question.trim(),
        workspaceContext,
      },
    });

    const raw = await this.cursorProvider.generateText(prompt);
    const draft = validateAskWorkspace(this.parseAiJson(raw));

    return {
      message: 'AI workspace answer generated successfully.',
      draft,
    };
  }

  private parseAiJson(raw: string): unknown {
    try {
      return extractJsonPayload(raw);
    } catch (error) {
      this.logger.warn(
        `AI JSON parse failed. Preview: ${raw.slice(0, 500).replace(/\s+/g, ' ')}`,
      );

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new BadRequestException('AI response was not valid JSON.');
    }
  }

  async applyWorkBreakdown(user: JwtPayload, dto: ApplyWorkBreakdownDto) {
    this.ensureWorkBreakdownAccess(user);

    if (!canOperateOnTasks(user.role)) {
      throw new ForbiddenException(
        'Only admins and managers can apply AI-generated tasks.',
      );
    }

    await this.contentModerationService.assertCleanContent(user.sub, {
      ...Object.fromEntries(
        dto.tasks.flatMap((task, index) => [
          [`tasks[${index}].title`, task.title],
          [`tasks[${index}].description`, task.description],
        ]),
      ),
    });

    const project = await this.projectsService.ensureAccessibleProject(
      user,
      dto.projectId,
      true,
    );

    if (dto.updateProjectDescription) {
      const epicLines = dto.tasks
        .slice(0, 8)
        .map((task) => `- ${task.title}`)
        .join('\n');

      project.description = [
        project.description?.trim() || '',
        '',
        '## AI Generated Work Breakdown',
        epicLines,
      ]
        .filter(Boolean)
        .join('\n')
        .trim();

      await this.projectRepository.save(project);
    }

    const createdTasks: Awaited<ReturnType<TasksService['createTask']>>[] = [];

    for (const taskDraft of dto.tasks) {
      const descriptionParts = [
        taskDraft.description?.trim() ?? '',
        formatCriteriaBlock(
          'Acceptance Criteria',
          taskDraft.acceptanceCriteria ?? [],
        ),
        formatCriteriaBlock(
          'Definition of Done',
          taskDraft.definitionOfDone ?? [],
        ),
      ];

      const created = await this.tasksService.createTask(user, {
        projectId: project.id,
        title: taskDraft.title,
        description: descriptionParts.join('').trim(),
        priority: taskDraft.priority ?? TaskPriority.MEDIUM,
        estimatedHours: taskDraft.estimatedHours ?? undefined,
        labels: taskDraft.labels ?? [],
        status: TaskStatus.TODO,
      });

      createdTasks.push(created);
    }

    return {
      message: `${createdTasks.length} AI-generated task(s) created successfully.`,
      tasks: createdTasks,
    };
  }

  private ensureWorkBreakdownAccess(user: JwtPayload) {
    if (!user.organizationId) {
      throw new ForbiddenException('Organization membership is required.');
    }

    if (!canUseAiWorkBreakdown(user.role)) {
      throw new ForbiddenException(
        'AI work breakdown is available to admins and managers.',
      );
    }
  }

  private ensureProjectToolsAccess(user: JwtPayload) {
    if (!user.organizationId) {
      throw new ForbiddenException('Organization membership is required.');
    }

    if (!canUseAiProjectTools(user.role)) {
      throw new ForbiddenException(
        'AI project tools are available to owners, admins, and managers.',
      );
    }
  }

  private ensureTaskDraftAccess(user: JwtPayload) {
    if (!user.organizationId) {
      throw new ForbiddenException('Organization membership is required.');
    }

    if (!canUseAiTaskDraft(user.role)) {
      throw new ForbiddenException(
        'AI task drafting is available to admins and managers.',
      );
    }
  }

  private ensureActivityDescribeAccess(user: JwtPayload) {
    if (!user.organizationId) {
      throw new ForbiddenException('Organization membership is required.');
    }

    if (!canUseAiActivityDescribe(user.role)) {
      throw new ForbiddenException(
        'AI activity describe is available to owners and admins.',
      );
    }
  }

  private async getOrganization(organizationId: string) {
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    return organization;
  }
}
