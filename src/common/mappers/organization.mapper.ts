import { User } from '../../entities/user.entity';
import { Organization } from '../../entities/organization.entity';
import {
  AccountStatus,
  EmailVerificationStatus,
  RegisterAs,
} from '../../enum/auth.enum';
import { mapOrganizationResponse, type OrganizationResponse } from './billing.mapper';

export type OrganizationMemberResponse = {
  id: string;
  fullName: string;
  email: string;
  role: RegisterAs;
  accountStatus: AccountStatus;
  emailVerificationStatus: EmailVerificationStatus;
  joinedAt: string;
};

export type WorkspaceOrganizationResponse = OrganizationResponse & {
  billingEmail: string | null;
  slug: string;
};

export type OrganizationMembersSummaryResponse = {
  occupiedSeats: number;
  totalSeats: number;
  members: OrganizationMemberResponse[];
};

const WORKSPACE_SEAT_LIMITS: Record<string, number> = {
  FREE: 5,
  PRO: 50,
  BUSINESS: 250,
  ENTERPRISE: 1000,
};

export function mapOrganizationMemberResponse(user: User): OrganizationMemberResponse {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    accountStatus: user.accountStatus,
    emailVerificationStatus: user.emailVerificationStatus,
    joinedAt: user.createdAt.toISOString(),
  };
}

export function mapWorkspaceOrganizationResponse(
  organization: Organization,
  usersCount: number,
): WorkspaceOrganizationResponse {
  const base = mapOrganizationResponse(organization, usersCount);
  const planCode = base.plan.code;

  return {
    ...base,
    slug: organization.slug,
    billingEmail: organization.billingEmail,
  };
}

export function resolveOrganizationSeatLimit(planCode: string) {
  return WORKSPACE_SEAT_LIMITS[planCode] ?? WORKSPACE_SEAT_LIMITS.FREE;
}

export function mapOrganizationMembersSummary(
  members: User[],
  planCode: string,
): OrganizationMembersSummaryResponse {
  const activeMembers = members.filter(
    (member) => member.accountStatus !== AccountStatus.SUSPENDED,
  );

  return {
    occupiedSeats: activeMembers.length,
    totalSeats: resolveOrganizationSeatLimit(planCode),
    members: activeMembers.map(mapOrganizationMemberResponse),
  };
}
