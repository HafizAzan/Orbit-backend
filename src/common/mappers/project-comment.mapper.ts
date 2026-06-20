import type { ProjectComment } from '../../entities/project-comment.entity';
import { pickAvatarColor } from './team.mapper';

export type ProjectCommentResponse = {
  id: string;
  userName: string;
  message: string;
  timeAgo: string;
  avatarColor: string;
  createdAt: string;
  authorId: string;
};

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) {
    return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function mapProjectCommentResponse(
  comment: ProjectComment,
): ProjectCommentResponse {
  const authorName = comment.author?.fullName ?? 'Member';

  return {
    id: comment.id,
    userName: authorName,
    message: comment.body,
    timeAgo: formatTimeAgo(comment.createdAt),
    avatarColor: pickAvatarColor(authorName),
    createdAt: comment.createdAt.toISOString(),
    authorId: comment.authorId,
  };
}
