import { User } from '../../entities/user.entity';
import {
  AccountStatus,
  RegisterAs,
  SignupSource,
} from '../../enum/auth.enum';
import { MemberDepartment } from '../../enum/member.enum';

export type TeamMemberStatus = 'active' | 'invited' | 'deactivated';

export type TeamMemberResponse = {
  id: string;
  name: string;
  email: string;
  department: MemberDepartment;
  projects: number;
  joinedDate: string;
  role: RegisterAs;
  status: TeamMemberStatus;
  lastActive: string;
};

export type TeamStatsResponse = {
  totalSeats: {
    used: number;
    total: number;
  };
  pendingInvites: number;
  activeToday: number;
  activeTodayTrend: string;
};

const AVATAR_COLORS = [
  'bg-violet-100 text-violet-700',
  'bg-sky-100 text-sky-700',
  'bg-amber-100 text-amber-700',
  'bg-emerald-100 text-emerald-700',
  'bg-rose-100 text-rose-700',
  'bg-indigo-100 text-indigo-700',
  'bg-teal-100 text-teal-700',
];

function formatJoinedDate(user: User): string {
  if (
    user.accountStatus === AccountStatus.PENDING &&
    user.signupSource === SignupSource.INVITE
  ) {
    return 'Pending';
  }

  return user.createdAt.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatLastActive(user: User): string {
  if (
    user.accountStatus === AccountStatus.PENDING &&
    user.signupSource === SignupSource.INVITE
  ) {
    return 'Invite sent';
  }

  const reference = user.lastActiveAt ?? user.updatedAt;
  const diffMs = Date.now() - reference.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? '' : 's'} ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return reference.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function mapTeamMemberStatus(user: User): TeamMemberStatus {
  if (user.accountStatus === AccountStatus.SUSPENDED) {
    return 'deactivated';
  }

  if (
    user.accountStatus === AccountStatus.PENDING &&
    user.signupSource === SignupSource.INVITE
  ) {
    return 'invited';
  }

  if (user.accountStatus === AccountStatus.PENDING) {
    return 'invited';
  }

  return 'active';
}

export function mapTeamMemberResponse(
  user: User,
  projectCount = 0,
): TeamMemberResponse {
  return {
    id: user.id,
    name: user.fullName,
    email: user.email,
    department: user.department ?? MemberDepartment.ENGINEERING,
    projects: projectCount,
    joinedDate: formatJoinedDate(user),
    role: user.role,
    status: mapTeamMemberStatus(user),
    lastActive: formatLastActive(user),
  };
}

export function pickAvatarColor(seed: string) {
  const hash = seed.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function isActiveToday(date: Date | null) {
  if (!date) return false;

  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}
