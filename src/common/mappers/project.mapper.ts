import { Project } from '../../entities/project.entity';
import { ProjectMember } from '../../entities/project-member.entity';
import { User } from '../../entities/user.entity';
import {
  ProjectCategory,
  ProjectMemberRole,
} from '../../enum/project.enum';
import { pickAvatarColor } from './team.mapper';

export type ProjectMemberSummary = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  projectRole: ProjectMemberRole;
};

export type WorkspaceProjectResponse = {
  id: string;
  title: string;
  description: string;
  key: string;
  status: string;
  priority: string;
  category: string;
  visibility: string;
  teamId: string;
  progress: number;
  dueDate: string | null;
  startDate: string | null;
  taskCount: number;
  completedTaskCount: number;
  totalEstimatedHours: number;
  commentCount: number;
  icon: 'design' | 'mobile' | 'security' | 'migration';
  iconBg: string;
  iconColor: string;
  leadUserId: string | null;
  createdById: string;
  members: ProjectMemberSummary[];
  viewerRole: ProjectMemberRole | 'org_admin' | null;
};

const CATEGORY_ICON: Record<
  ProjectCategory,
  Pick<WorkspaceProjectResponse, 'icon' | 'iconBg' | 'iconColor' | 'teamId'>
> = {
  [ProjectCategory.DESIGN]: {
    icon: 'design',
    iconBg: 'bg-indigo-50',
    iconColor: 'text-indigo-600',
    teamId: 'design',
  },
  [ProjectCategory.ENGINEERING]: {
    icon: 'mobile',
    iconBg: 'bg-sky-50',
    iconColor: 'text-sky-600',
    teamId: 'mobile',
  },
  [ProjectCategory.OPERATIONS]: {
    icon: 'security',
    iconBg: 'bg-red-50',
    iconColor: 'text-red-600',
    teamId: 'security',
  },
  [ProjectCategory.MARKETING]: {
    icon: 'migration',
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    teamId: 'platform',
  },
  [ProjectCategory.PRODUCT]: {
    icon: 'design',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    teamId: 'platform',
  },
};

export function mapProjectMemberSummary(
  membership: ProjectMember,
): ProjectMemberSummary {
  const user = membership.user;

  return {
    id: user.id,
    name: user.fullName,
    email: user.email,
    avatarColor: pickAvatarColor(user.fullName),
    projectRole: membership.role,
  };
}

export type ProjectTaskStats = {
  completedTaskCount: number;
  totalEstimatedHours: number;
};

export function mapWorkspaceProjectResponse(
  project: Project,
  viewerRole: WorkspaceProjectResponse['viewerRole'] = null,
  taskStats?: ProjectTaskStats,
): WorkspaceProjectResponse {
  const iconMeta = CATEGORY_ICON[project.category] ?? CATEGORY_ICON[ProjectCategory.PRODUCT];
  const members = (project.members ?? [])
    .filter((membership) => membership.user)
    .map(mapProjectMemberSummary);

  return {
    id: project.id,
    title: project.name,
    description: project.description,
    key: project.key,
    status: project.status,
    priority: project.priority,
    category: project.category,
    visibility: project.visibility,
    teamId: iconMeta.teamId,
    progress: project.progress,
    dueDate: project.dueDate,
    startDate: project.startDate,
    taskCount: project.taskCount,
    completedTaskCount:
      taskStats?.completedTaskCount ??
      (project.taskCount > 0
        ? Math.round((project.progress / 100) * project.taskCount)
        : 0),
    totalEstimatedHours: taskStats?.totalEstimatedHours ?? 0,
    commentCount: project.commentCount,
    icon: iconMeta.icon,
    iconBg: iconMeta.iconBg,
    iconColor: iconMeta.iconColor,
    leadUserId: project.leadUserId,
    createdById: project.createdById,
    members,
    viewerRole,
  };
}

export function mapAssignableProjectMember(user: User) {
  return {
    id: user.id,
    name: user.fullName,
    email: user.email,
    avatarColor: pickAvatarColor(user.fullName),
  };
}
