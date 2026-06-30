import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'crypto';
import { QueryFailedError, Repository } from 'typeorm';
import {
  isActiveToday,
  isActiveOnDate,
  buildActiveTodayTrend,
  mapTeamMemberResponse,
  type TeamMemberDetailResponse,
  type TeamMemberResponse,
  type TeamStatsResponse,
} from '../common/mappers/team.mapper';
import { resolveOrganizationSeatLimit } from '../common/mappers/organization.mapper';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { EmailService } from '../email/email.service';
import {
  AccountStatus,
  AuthProvider,
  EmailVerificationStatus,
  RegisterAs,
  SignupSource,
} from '../enum/auth.enum';
import { MemberDepartment } from '../enum/member.enum';
import { PlanCode } from '../enum/billing.enum';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import {
  InviteTeamMemberDto,
  UpdateTeamMemberRoleDto,
  UpdateTeamMemberStatusDto,
} from './dto/team.dto';
import { ProjectsService } from '../projects/projects.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityAction, ActivityModule } from '../enum/activity.enum';
import { hasOrgWideProjectAccess } from '../projects/project-access.util';
import { ListMembersQueryDto } from '../common/dto/list-members-query.dto';
import {
  paginateArray,
  type PaginatedResponse,
} from '../common/dto/pagination-query.dto';
import { filterOrganizationMembersForList } from '../common/utils/filter-organization-members.util';

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const ASSIGNABLE_MEMBER_ROLES: RegisterAs[] = [
  RegisterAs.ADMIN,
  RegisterAs.MANAGER,
  RegisterAs.MEMBER,
];

const ROLE_LABELS: Record<string, string> = {
  [RegisterAs.ADMIN]: 'Admin',
  [RegisterAs.MANAGER]: 'Manager',
  [RegisterAs.MEMBER]: 'Member',
};

@Injectable()
export class TeamService {
  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly projectsService: ProjectsService,
    private readonly activityService: ActivityService,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async listMembers(
    user: JwtPayload,
    query: ListMembersQueryDto = {},
  ): Promise<PaginatedResponse<TeamMemberResponse>> {
    const organization = await this.getOrganizationForUser(
      user.organizationId!,
    );

    let members = [...(organization.users ?? [])];

    if (!hasOrgWideProjectAccess(user.role)) {
      const squadIds = await this.projectsService.getSquadUserIds(user);
      members = members.filter((member) => squadIds.has(member.id));
    }

    members = filterOrganizationMembersForList(members, query.isOwnerNeeded);
    members.sort(
      (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
    );

    const mapped = await this.mapMembersWithProjectCounts(
      user.organizationId!,
      members,
    );

    return paginateArray(mapped, query);
  }

  async getMemberDetail(
    actor: JwtPayload,
    memberId: string,
  ): Promise<TeamMemberDetailResponse> {
    const member = await this.getOrganizationMember(actor.organizationId!, memberId);
    await this.ensureMemberVisibleToActor(actor, member);

    const [baseMember, projectsDetail] = await Promise.all([
      this.mapMemberWithProjectCount(actor.organizationId!, member),
      this.projectsService.getMemberProjectTaskBreakdown(actor, memberId),
    ]);

    const totalAssignedTasks = projectsDetail.reduce(
      (sum, project) => sum + project.assignedTasks,
      0,
    );
    const completedAssignedTasks = projectsDetail.reduce(
      (sum, project) => sum + project.completedTasks,
      0,
    );

    return {
      ...baseMember,
      totalAssignedTasks,
      completedAssignedTasks,
      projectsDetail,
    };
  }

  private async ensureMemberVisibleToActor(actor: JwtPayload, member: User) {
    if (hasOrgWideProjectAccess(actor.role)) {
      return;
    }

    const squadIds = await this.projectsService.getSquadUserIds(actor);

    if (!squadIds.has(member.id)) {
      throw new ForbiddenException('You do not have access to this team member.');
    }
  }

  private async mapMembersWithProjectCounts(
    organizationId: string,
    members: User[],
  ): Promise<TeamMemberResponse[]> {
    const projectCounts =
      await this.projectsService.countProjectMembershipsByUserIds(
        organizationId,
        members.map((member) => member.id),
      );

    return members.map((member) =>
      mapTeamMemberResponse(member, projectCounts.get(member.id) ?? 0),
    );
  }

  private async mapMemberWithProjectCount(
    organizationId: string,
    member: User,
  ): Promise<TeamMemberResponse> {
    const projectCount =
      await this.projectsService.countProjectMembershipsForUser(
        organizationId,
        member.id,
      );

    return mapTeamMemberResponse(member, projectCount);
  }

  async getStats(user: JwtPayload): Promise<TeamStatsResponse> {
    const organization = await this.getOrganizationForUser(
      user.organizationId!,
    );
    let members = [...(organization.users ?? [])];

    if (!hasOrgWideProjectAccess(user.role)) {
      const squadIds = await this.projectsService.getSquadUserIds(user);
      members = members.filter((member) => squadIds.has(member.id));
    }

    const planCode = organization.subscription?.plan ?? PlanCode.FREE;
    const totalSeats = resolveOrganizationSeatLimit(planCode);
    const occupiedSeats = members.filter(
      (member) => member.accountStatus !== AccountStatus.SUSPENDED,
    ).length;

    const pendingInvites = members.filter(
      (member) =>
        member.accountStatus === AccountStatus.PENDING &&
        member.signupSource === SignupSource.INVITE,
    ).length;

    const activeToday = members.filter(
      (member) =>
        member.accountStatus === AccountStatus.ACTIVE &&
        isActiveToday(member.lastActiveAt),
    ).length;

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const activeWeekAgo = members.filter(
      (member) =>
        member.accountStatus === AccountStatus.ACTIVE &&
        isActiveOnDate(member.lastActiveAt, weekAgo),
    ).length;

    return {
      totalSeats: {
        used: occupiedSeats,
        total: totalSeats,
      },
      pendingInvites,
      activeToday,
      activeTodayTrend: buildActiveTodayTrend(activeToday, activeWeekAgo),
    };
  }

  async removeMemberFromSquad(actor: JwtPayload, memberId: string) {
    return this.projectsService.removeUserFromManagedProjects(actor, memberId);
  }

  async inviteMember(
    actor: JwtPayload,
    dto: InviteTeamMemberDto,
  ): Promise<TeamMemberResponse> {
    this.ensureAssignableRole(dto.role);

    const organization = await this.getOrganizationForUser(
      actor.organizationId!,
    );
    const email = dto.email.trim().toLowerCase();
    const stats = await this.getStats(actor);

    if (stats.totalSeats.used >= stats.totalSeats.total) {
      throw new BadRequestException(
        'No seats available. Upgrade your plan or free up a seat first.',
      );
    }

    const existing = await this.userRepository.findOne({
      where: { email, organizationId: organization.id },
    });

    if (existing) {
      this.rejectDuplicateInvite(existing);
    }

    const emailUsedElsewhere = await this.userRepository.findOne({
      where: { email },
    });

    if (emailUsedElsewhere) {
      throw new ConflictException('A user with this email already exists.');
    }

    const inviter = await this.getOrganizationMember(
      actor.organizationId!,
      actor.sub,
    );
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const fullName = dto.name?.trim() || this.formatNameFromEmail(email);

    let member: User;

    try {
      member = await this.userRepository.save(
        this.userRepository.create({
          fullName,
          email,
          passwordHash: null,
          authProvider: AuthProvider.EMAIL,
          signupSource: SignupSource.INVITE,
          role: dto.role,
          emailVerificationStatus: EmailVerificationStatus.PENDING,
          accountStatus: AccountStatus.PENDING,
          isPlatformAdmin: false,
          organizationId: organization.id,
          department: dto.department ?? MemberDepartment.ENGINEERING,
          inviteToken: token,
          inviteExpiresAt: expiresAt,
          invitedById: inviter.id,
        }),
      );
    } catch (error) {
      if (this.isUniqueEmailViolation(error)) {
        throw new ConflictException(
          'This email already has a pending invitation or is already a team member.',
        );
      }

      throw error;
    }

    if (dto.sendWelcomeEmail !== false) {
      await this.sendInviteEmail({
        member,
        organizationName: organization.name,
        inviterName: inviter.fullName,
        role: dto.role,
        message: dto.message,
        token,
      });
    }

    await this.activityService.recordForUser(actor, {
      module: ActivityModule.TEAMS,
      action: ActivityAction.INVITED,
      summary: `Invited ${member.fullName} as ${ROLE_LABELS[dto.role] ?? dto.role}`,
      targetLabel: member.fullName,
      resourceType: 'user',
      resourceId: member.id,
    });

    return this.mapMemberWithProjectCount(actor.organizationId!, member);
  }

  async updateMemberRole(
    actor: JwtPayload,
    memberId: string,
    dto: UpdateTeamMemberRoleDto,
  ): Promise<TeamMemberResponse> {
    this.ensureAssignableRole(dto.role);

    const member = await this.getOrganizationMember(
      actor.organizationId!,
      memberId,
    );

    if (member.id === actor.sub) {
      throw new BadRequestException('You cannot change your own role.');
    }

    if (member.role === RegisterAs.OWNER) {
      throw new ForbiddenException(
        'The organization owner role cannot be changed.',
      );
    }

    member.role = dto.role;
    await this.userRepository.save(member);

    await this.activityService.recordForUser(actor, {
      module: ActivityModule.TEAMS,
      action: ActivityAction.ROLE_CHANGED,
      summary: `Changed role for ${member.fullName}`,
      targetLabel: member.fullName,
      resourceType: 'user',
      resourceId: member.id,
      metadata: { role: dto.role },
    });

    return this.mapMemberWithProjectCount(actor.organizationId!, member);
  }

  async updateMemberStatus(
    actor: JwtPayload,
    memberId: string,
    dto: UpdateTeamMemberStatusDto,
  ): Promise<TeamMemberResponse> {
    const member = await this.getOrganizationMember(
      actor.organizationId!,
      memberId,
    );

    if (member.id === actor.sub) {
      throw new BadRequestException(
        'You cannot change your own account status.',
      );
    }

    if (member.role === RegisterAs.OWNER) {
      throw new ForbiddenException(
        'The organization owner cannot be deactivated.',
      );
    }

    if (dto.status === 'deactivated') {
      member.accountStatus = AccountStatus.SUSPENDED;
    } else {
      if (
        member.signupSource === SignupSource.INVITE &&
        member.accountStatus === AccountStatus.PENDING
      ) {
        throw new BadRequestException(
          'Pending invites must accept their invitation before becoming active.',
        );
      }

      member.accountStatus = AccountStatus.ACTIVE;
    }

    await this.userRepository.save(member);

    return this.mapMemberWithProjectCount(actor.organizationId!, member);
  }

  async deleteMember(actor: JwtPayload, memberId: string) {
    const member = await this.getOrganizationMember(
      actor.organizationId!,
      memberId,
    );

    if (member.id === actor.sub) {
      throw new BadRequestException('You cannot delete your own account.');
    }

    if (member.role === RegisterAs.OWNER) {
      throw new ForbiddenException('The organization owner cannot be deleted.');
    }

    if (member.accountStatus !== AccountStatus.SUSPENDED) {
      throw new BadRequestException(
        'Only deactivated members can be permanently deleted. Deactivate the member first.',
      );
    }

    await this.userRepository.update(
      { invitedById: member.id },
      { invitedById: null },
    );

    await this.userRepository.delete(member.id);

    return {
      message: `${member.fullName} has been permanently removed from the workspace.`,
    };
  }

  async resendInvite(actor: JwtPayload, memberId: string) {
    const member = await this.getOrganizationMember(
      actor.organizationId!,
      memberId,
    );

    if (
      member.accountStatus !== AccountStatus.PENDING ||
      member.signupSource !== SignupSource.INVITE
    ) {
      throw new BadRequestException('Only pending invitations can be resent.');
    }

    const organization = await this.getOrganizationForUser(
      actor.organizationId!,
    );
    const inviter = await this.getOrganizationMember(
      actor.organizationId!,
      actor.sub,
    );
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

    member.inviteToken = token;
    member.inviteExpiresAt = expiresAt;
    await this.userRepository.save(member);

    await this.sendInviteEmail({
      member,
      organizationName: organization.name,
      inviterName: inviter.fullName,
      role: member.role,
      token,
    });

    return {
      message: `Invitation resent to ${member.email}.`,
    };
  }

  async resendAllPendingInvites(actor: JwtPayload) {
    const organization = await this.getOrganizationForUser(
      actor.organizationId!,
    );
    const pendingMembers = (organization.users ?? []).filter(
      (member) =>
        member.accountStatus === AccountStatus.PENDING &&
        member.signupSource === SignupSource.INVITE,
    );

    if (pendingMembers.length === 0) {
      return {
        message: 'No pending invitations to resend.',
        count: 0,
      };
    }

    const inviter = await this.getOrganizationMember(
      actor.organizationId!,
      actor.sub,
    );

    for (const member of pendingMembers) {
      const token = randomBytes(32).toString('hex');
      member.inviteToken = token;
      member.inviteExpiresAt = new Date(Date.now() + INVITE_TTL_MS);
      await this.userRepository.save(member);

      await this.sendInviteEmail({
        member,
        organizationName: organization.name,
        inviterName: inviter.fullName,
        role: member.role,
        token,
      });
    }

    return {
      message: `${pendingMembers.length} pending invitation${pendingMembers.length === 1 ? '' : 's'} resent.`,
      count: pendingMembers.length,
    };
  }

  private async sendInviteEmail(params: {
    member: User;
    organizationName: string;
    inviterName: string;
    role: RegisterAs;
    message?: string;
    token: string;
  }) {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
    const inviteUrl = `${frontendUrl.replace(/\/$/, '')}/accept-invite?token=${params.token}`;

    await this.emailService.sendTeamInviteEmail({
      to: params.member.email,
      fullName: params.member.fullName,
      organizationName: params.organizationName,
      inviterName: params.inviterName,
      roleLabel: ROLE_LABELS[params.role] ?? 'Member',
      inviteUrl,
      message: params.message,
    });
  }

  private rejectDuplicateInvite(existing: User) {
    if (existing.accountStatus === AccountStatus.SUSPENDED) {
      throw new BadRequestException(
        'This member is deactivated. Reactivate them or permanently delete them before inviting this email again.',
      );
    }

    if (
      existing.accountStatus === AccountStatus.PENDING &&
      existing.signupSource === SignupSource.INVITE
    ) {
      throw new ConflictException(
        'This email already has a pending invitation.',
      );
    }

    throw new ConflictException(
      'This person is already an active team member.',
    );
  }

  private isUniqueEmailViolation(error: unknown) {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as { code?: string };
    return driverError.code === '23505';
  }

  private formatNameFromEmail(email: string) {
    const localPart = email.split('@')[0] ?? 'Member';
    return localPart
      .replace(/[._-]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  private ensureAssignableRole(role: RegisterAs) {
    if (!ASSIGNABLE_MEMBER_ROLES.includes(role)) {
      throw new BadRequestException('Invalid member role.');
    }
  }

  private async getOrganizationForUser(organizationId: string) {
    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
      relations: { subscription: true, users: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    return organization;
  }

  private async getOrganizationMember(
    organizationId: string,
    memberId: string,
  ) {
    const member = await this.userRepository.findOne({
      where: { id: memberId, organizationId },
    });

    if (!member) {
      throw new NotFoundException('Team member not found.');
    }

    return member;
  }
}
