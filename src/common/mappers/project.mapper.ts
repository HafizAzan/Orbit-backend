import { Project } from '../../entities/project.entity';
import { ProjectMember } from '../../entities/project-member.entity';
import { User } from '../../entities/user.entity';
import {
  ProjectCategory,
  ProjectMemberRole,
  ProjectTheme,
} from '../../enum/project.enum';
import { pickAvatarColor } from './team.mapper';
import {
  getProjectThemeMeta,
  type ProjectThemeMeta,
} from './project-theme.mapper';

export type ProjectMemberSummary = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  projectRole: ProjectMemberRole;
  /** Organization workspace role (owner/admin/manager/member). */
  role: string;
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
  theme: string;
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
  themeMeta: Pick<
    ProjectThemeMeta,
    | 'accent'
    | 'accentSoft'
    | 'accentText'
    | 'headerFrom'
    | 'headerTo'
    | 'cardBorder'
    | 'pillBg'
    | 'previewGradient'
  >;
  leadUserId: string | null;
  createdById: string;
  githubRepoFullName: string | null;
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
    role: user.role,
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
  viewerTheme: ProjectTheme = ProjectTheme.CLASSIC,
): WorkspaceProjectResponse {
  const categoryMeta =
    CATEGORY_ICON[project.category] ?? CATEGORY_ICON[ProjectCategory.PRODUCT];
  const themeMeta = getProjectThemeMeta(viewerTheme);
  const useCustomTheme = viewerTheme !== ProjectTheme.CLASSIC;
  const iconMeta = useCustomTheme
    ? {
        ...categoryMeta,
        iconBg: themeMeta.iconBg,
        iconColor: themeMeta.iconColor,
      }
    : categoryMeta;
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
    theme: viewerTheme,
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
    themeMeta: {
      accent: themeMeta.accent,
      accentSoft: themeMeta.accentSoft,
      accentText: themeMeta.accentText,
      headerFrom: themeMeta.headerFrom,
      headerTo: themeMeta.headerTo,
      cardBorder: themeMeta.cardBorder,
      pillBg: themeMeta.pillBg,
      previewGradient: themeMeta.previewGradient,
    },
    leadUserId: project.leadUserId,
    createdById: project.createdById,
    githubRepoFullName: project.githubRepoFullName ?? null,
    members,
    viewerRole,
  };
}

export function mapAssignableProjectMember(user: User) {
  return {
    id: user.id,
    name: user.fullName,
    email: user.email,
    role: user.role,
    avatarColor: pickAvatarColor(user.fullName),
  };
}
