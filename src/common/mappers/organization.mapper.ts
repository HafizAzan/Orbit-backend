import { User } from '../../entities/user.entity';
import { Organization } from '../../entities/organization.entity';
import {
  AccountStatus,
  EmailVerificationStatus,
  RegisterAs,
} from '../../enum/auth.enum';
import {
  mapOrganizationResponse,
  type OrganizationResponse,
} from './billing.mapper';
import {
  DEFAULT_ORGANIZATION_WORKSPACE_SETTINGS,
  type OrganizationWorkspaceSettings,
} from '../../common/types/organization-workspace-settings.type';

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
  workspaceSettings: OrganizationWorkspaceSettings;
};

import type {
  PaginatedResponse,
  PaginationQueryDto,
} from '../dto/pagination-query.dto';
import {
  buildPaginatedResponse,
  paginateArray,
  resolvePagination,
} from '../dto/pagination-query.dto';

export type OrganizationMembersSummaryResponse = {
  occupiedSeats: number;
  totalSeats: number;
} & PaginatedResponse<OrganizationMemberResponse>;

export type OrganizationAboutPersonResponse = {
  id: string;
  fullName: string;
  email: string;
  role: RegisterAs;
};

export type OrganizationAboutResponse = {
  organization: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
  };
  owner: OrganizationAboutPersonResponse;
  admins: {
    count: number;
    data: OrganizationAboutPersonResponse[];
  };
  managers: {
    count: number;
    data: OrganizationAboutPersonResponse[];
  };
};

const WORKSPACE_SEAT_LIMITS: Record<string, number> = {
  FREE: 5,
  PRO: 50,
  BUSINESS: 250,
  ENTERPRISE: 1000,
};

export function mapOrganizationMemberResponse(
  user: User,
): OrganizationMemberResponse {
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

export function mapOrganizationAboutPersonResponse(
  user: User,
): OrganizationAboutPersonResponse {
  return {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
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
    workspaceSettings:
      organization.workspaceSettings ?? DEFAULT_ORGANIZATION_WORKSPACE_SETTINGS,
  };
}

export function resolveOrganizationSeatLimit(planCode: string) {
  return WORKSPACE_SEAT_LIMITS[planCode] ?? WORKSPACE_SEAT_LIMITS.FREE;
}

export function mapOrganizationMembersSummary(
  members: User[],
  planCode: string,
  query: PaginationQueryDto = {},
): OrganizationMembersSummaryResponse {
  const activeMembers = members.filter(
    (member) => member.accountStatus !== AccountStatus.SUSPENDED,
  );
  const mappedMembers = activeMembers.map(mapOrganizationMemberResponse);
  const { page, limit, skip, take } = resolvePagination(query);
  const paginated = buildPaginatedResponse(
    mappedMembers.slice(skip, skip + take),
    mappedMembers.length,
    page,
    limit,
  );

  return {
    occupiedSeats: activeMembers.length,
    totalSeats: resolveOrganizationSeatLimit(planCode),
    ...paginated,
  };
}
