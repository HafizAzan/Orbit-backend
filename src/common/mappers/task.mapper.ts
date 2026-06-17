import { Task } from '../../entities/task.entity';
import { User } from '../../entities/user.entity';
import { TaskPriority, TaskStatus } from '../../enum/task.enum';
import { pickAvatarColor } from './team.mapper';

export type TaskAssigneeSummary = {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
};

export type WorkspaceTaskResponse = {
  id: string;
  taskCode: string;
  title: string;
  description: string;
  projectId: string;
  project: string;
  projectKey: string;
  assignee: TaskAssigneeSummary | null;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

function buildInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return 'U';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

export function mapTaskAssignee(user: User | null | undefined): TaskAssigneeSummary | null {
  if (!user) {
    return null;
  }

  const name = user.fullName?.trim() || user.email;

  return {
    id: user.id,
    name,
    initials: buildInitials(name),
    avatarColor: pickAvatarColor(name),
  };
}

export function mapWorkspaceTaskResponse(task: Task): WorkspaceTaskResponse {
  const project = task.project;
  const projectKey = project?.key ?? 'TASK';
  const projectName = project?.name ?? 'Project';

  return {
    id: task.id,
    taskCode: `${projectKey}-${task.taskNumber}`,
    title: task.title,
    description: task.description,
    projectId: task.projectId,
    project: projectName,
    projectKey,
    assignee: mapTaskAssignee(task.assignee),
    priority: task.priority,
    status: task.status,
    dueDate: task.dueDate,
    createdById: task.createdById,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function mapKanbanTask(task: Task) {
  const assignee = mapTaskAssignee(task.assignee);

  return {
    id: task.id,
    title: task.title,
    description: task.description || undefined,
    priority:
      task.priority === TaskPriority.CRITICAL || task.priority === TaskPriority.HIGH
        ? 'high'
        : task.priority === TaskPriority.LOW
          ? 'low'
          : 'medium',
    dueLabel: task.dueDate ? formatDueLabel(task.dueDate) : 'No due date',
    assignee: assignee
      ? {
          ...assignee,
          avatarColor: assignee.avatarColor,
        }
      : {
          id: 'unassigned',
          name: 'Unassigned',
          initials: 'UA',
          avatarColor: '#94a3b8',
        },
  };
}

function formatDueLabel(dueDate: string) {
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return 'Due today';
  if (diffDays === 1) return 'Due tomorrow';
  if (diffDays === -1) return 'Due yesterday';
  if (diffDays < 0) return `${Math.abs(diffDays)}d overdue`;

  return `Due in ${diffDays}d`;
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: '#94a3b8',
  [TaskStatus.IN_PROGRESS]: '#6366f1',
  [TaskStatus.REVIEW]: '#f59e0b',
  [TaskStatus.DONE]: '#10b981',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.TODO]: 'To Do',
  [TaskStatus.IN_PROGRESS]: 'In Progress',
  [TaskStatus.REVIEW]: 'In Review',
  [TaskStatus.DONE]: 'Done',
};

export function buildTaskStatusSlices(tasks: Task[]) {
  return (Object.values(TaskStatus) as TaskStatus[]).map((status) => ({
    id: status,
    label: STATUS_LABELS[status],
    count: tasks.filter((task) => task.status === status).length,
    color: STATUS_COLORS[status],
  }));
}

export { STATUS_LABELS, STATUS_COLORS };
