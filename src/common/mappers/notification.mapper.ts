import { Notification } from '../../entities/notification.entity';
import { NotificationKind } from '../../enum/notification.enum';

export type NotificationResponse = {
  id: string;
  title: string;
  message: string;
  timeAgo: string;
  read: boolean;
  kind: NotificationKind;
  href: string | null;
  resourceType: string | null;
  resourceId: string | null;
  createdAt: string;
};

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;

  return date.toLocaleDateString();
}

export function mapNotificationResponse(
  notification: Notification,
): NotificationResponse {
  return {
    id: notification.id,
    title: notification.title,
    message: notification.message,
    timeAgo: formatTimeAgo(notification.createdAt),
    read: notification.read,
    kind: notification.kind,
    href: notification.href,
    resourceType: notification.resourceType,
    resourceId: notification.resourceId,
    createdAt: notification.createdAt.toISOString(),
  };
}
