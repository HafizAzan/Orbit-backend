import { ActivityEvent } from '../../entities/activity-event.entity';
import { ActivityAction } from '../../enum/activity.enum';

export type ActivityEventResponse = {
  id: string;
  actorId: string;
  actorName: string;
  actorRole: ActivityEvent['actorRole'];
  module: ActivityEvent['module'];
  action: ActivityEvent['action'];
  summary: string;
  targetLabel: string | null;
  resourceType: string | null;
  resourceId: string | null;
  projectId: string | null;
  createdAt: string;
  canDelete: boolean;
};

export type ActivityFeedItemResponse = {
  id: string;
  userName: string;
  action: string;
  target: string;
  timeAgo: string;
  avatarColor: string;
  module: ActivityEvent['module'];
  createdAt: string;
  canDelete: boolean;
};

const AVATAR_COLORS = [
  'bg-indigo-100 text-indigo-700',
  'bg-sky-100 text-sky-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-700',
  'bg-rose-100 text-rose-700',
];

const ACTION_VERB_LABELS: Record<ActivityAction, string> = {
  [ActivityAction.CREATED]: 'created',
  [ActivityAction.UPDATED]: 'updated',
  [ActivityAction.DELETED]: 'deleted',
  [ActivityAction.ASSIGNED]: 'assigned',
  [ActivityAction.STATUS_CHANGED]: 'changed status of',
  [ActivityAction.INVITED]: 'invited',
  [ActivityAction.REMOVED]: 'removed',
  [ActivityAction.ROLE_CHANGED]: 'changed role for',
  [ActivityAction.EMAIL_CHANGED]: 'updated email for',
  [ActivityAction.REQUESTED]: 'requested',
};

function resolveAvatarColor(actorId: string) {
  let hash = 0;

  for (let index = 0; index < actorId.length; index += 1) {
    hash = actorId.charCodeAt(index) + ((hash << 5) - hash);
  }

  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function formatRelativeTime(isoDate: string) {
  const timestamp = new Date(isoDate).getTime();
  const diffMs = Date.now() - timestamp;

  if (diffMs < 60_000) {
    return 'Just now';
  }

  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `${hours}h ago`;
  }

  const days = Math.floor(hours / 24);

  if (days < 7) {
    return `${days}d ago`;
  }

  return new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function mapActivityEventResponse(
  event: ActivityEvent,
  canDelete: boolean,
): ActivityEventResponse {
  return {
    id: event.id,
    actorId: event.actorId,
    actorName: event.actorName,
    actorRole: event.actorRole,
    module: event.module,
    action: event.action,
    summary: event.summary,
    targetLabel: event.targetLabel,
    resourceType: event.resourceType,
    resourceId: event.resourceId,
    projectId: event.projectId,
    createdAt: event.createdAt.toISOString(),
    canDelete,
  };
}

export function mapActivityFeedItem(
  event: ActivityEvent,
  canDelete: boolean,
): ActivityFeedItemResponse {
  const verb = ACTION_VERB_LABELS[event.action] ?? event.action;

  return {
    id: event.id,
    userName: event.actorName,
    action: verb,
    target: event.targetLabel ?? event.summary,
    timeAgo: formatRelativeTime(event.createdAt.toISOString()),
    avatarColor: resolveAvatarColor(event.actorId),
    module: event.module,
    createdAt: event.createdAt.toISOString(),
    canDelete,
  };
}
