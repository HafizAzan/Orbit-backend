import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import {
  buildPaginatedResponse,
  type PaginatedResponse,
  resolvePagination,
} from '../common/dto/pagination-query.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  buildActiveSubscriptionDates,
  buildCountStatMetric,
  buildTotalStatMetric,
  buildTrialSubscriptionDates,
  getDefaultAmountCents,
} from '../common/utils/billing.util';
import {
  mapOrganizationMembersSummary,
  mapOrganizationMemberResponse,
  mapOrganizationAboutPersonResponse,
  mapWorkspaceOrganizationResponse,
  type OrganizationAboutResponse,
  type OrganizationMembersSummaryResponse,
  type OrganizationMemberResponse,
  type WorkspaceOrganizationResponse,
} from '../common/mappers/organization.mapper';
import {
  mapOrganizationResponse,
  type OrganizationResponse,
  type OrganizationStatsResponse,
} from '../common/mappers/billing.mapper';
import { Organization } from '../entities/organization.entity';
import { Subscription } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';
import {
  AccountStatus,
  AuthProvider,
  EmailVerificationStatus,
  RegisterAs,
  SignupSource,
} from '../enum/auth.enum';
import {
  BillingCycle,
  OrganizationStatus,
  PlanCode,
  SubscriptionStatus,
} from '../enum/billing.enum';
import {
  CreateOrganizationDto,
  UpdateOrganizationDto,
} from './dto/organization.dto';
import { UpdateWorkspaceOrganizationDto } from './dto/workspace-organization.dto';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { ListMembersQueryDto } from '../common/dto/list-members-query.dto';
import { filterOrganizationMembersForList } from '../common/utils/filter-organization-members.util';
import { canActorChangeMemberEmail } from '../common/utils/email-access.util';
import { ProjectsService } from '../projects/projects.service';
import { ActivityService } from '../activity/activity.service';
import { ActivityAction, ActivityModule } from '../enum/activity.enum';
import { hasOrgWideProjectAccess } from '../projects/project-access.util';
import { mergeOrganizationWorkspaceSettings } from '../common/types/organization-workspace-settings.type';
import {
  buildTwoFactorOtpAuthUrl,
  generateTwoFactorSecret,
  verifyTwoFactorCode,
} from '../auth/two-factor.util';

const ASSIGNABLE_MEMBER_ROLES: RegisterAs[] = [
  RegisterAs.ADMIN,
  RegisterAs.MANAGER,
  RegisterAs.MEMBER,
];

function slugifyOrganizationName(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

@Injectable()
export class OrganizationsService {
  constructor(
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly projectsService: ProjectsService,
    private readonly activityService: ActivityService,
  ) {}

  async findAll(
    query: PaginationQueryDto = {},
  ): Promise<PaginatedResponse<OrganizationResponse>> {
    const { page, limit, skip, take } = resolvePagination(query);
    const [organizations, total] =
      await this.organizationRepository.findAndCount({
        relations: { subscription: true, users: true },
        order: { createdAt: 'DESC' },
        skip,
        take,
      });

    return buildPaginatedResponse(
      organizations.map((organization) =>
        mapOrganizationResponse(organization, organization.users?.length ?? 0),
      ),
      total,
      page,
      limit,
    );
  }

  async getStats(): Promise<OrganizationStatsResponse> {
    const organizations = await this.organizationRepository.find();
    const total = organizations.length;
    const active = organizations.filter(
      (org) => org.status === OrganizationStatus.ACTIVE,
    ).length;
    const trial = organizations.filter(
      (org) => org.status === OrganizationStatus.TRIAL,
    ).length;
    const suspended = organizations.filter(
      (org) => org.status === OrganizationStatus.SUSPENDED,
    ).length;

    return {
      total: buildTotalStatMetric(total),
      active: buildCountStatMetric(active, total),
      trial: buildCountStatMetric(trial, total),
      suspended: buildCountStatMetric(suspended, total),
    };
  }

  async findOne(id: string): Promise<OrganizationResponse> {
    const organization = await this.getOrganizationWithRelations(id);
    return mapOrganizationResponse(
      organization,
      organization.users?.length ?? 0,
    );
  }

  async create(dto: CreateOrganizationDto): Promise<OrganizationResponse> {
    const slug = await this.resolveUniqueSlug(
      dto.slug ?? slugifyOrganizationName(dto.name),
    );
    const ownerEmail = dto.ownerEmail.trim().toLowerCase();

    await this.ensureOwnerEmailAvailable(ownerEmail);

    const organization = await this.organizationRepository.save(
      this.organizationRepository.create({
        name: dto.name.trim(),
        slug,
        status: dto.status,
        billingEmail: ownerEmail,
        projectCount: 0,
      }),
    );

    const subscription = await this.createSubscriptionForOrganization(
      organization.id,
      dto.plan,
      dto.status === OrganizationStatus.TRIAL
        ? SubscriptionStatus.TRIAL
        : SubscriptionStatus.ACTIVE,
    );

    const owner = await this.userRepository.save(
      this.userRepository.create({
        fullName: dto.ownerName.trim(),
        email: ownerEmail,
        passwordHash: null,
        authProvider: AuthProvider.EMAIL,
        signupSource: SignupSource.DIRECT,
        role: RegisterAs.OWNER,
        emailVerificationStatus: EmailVerificationStatus.PENDING,
        accountStatus: AccountStatus.PENDING,
        isPlatformAdmin: false,
        organizationId: organization.id,
      }),
    );

    organization.subscription = subscription;
    organization.users = [owner];

    return mapOrganizationResponse(organization, 1, owner);
  }

  async update(
    id: string,
    dto: UpdateOrganizationDto,
  ): Promise<OrganizationResponse> {
    const organization = await this.getOrganizationWithRelations(id);

    if (dto.slug && dto.slug !== organization.slug) {
      organization.slug = await this.resolveUniqueSlug(dto.slug, id);
    }

    if (dto.name) {
      organization.name = dto.name.trim();
    }

    if (dto.status) {
      organization.status = dto.status;
    }

    if (dto.projectCount !== undefined) {
      organization.projectCount = dto.projectCount;
    }

    await this.organizationRepository.save(organization);

    if (dto.plan) {
      const subscription =
        organization.subscription ??
        (await this.createSubscriptionForOrganization(
          organization.id,
          dto.plan,
          SubscriptionStatus.TRIAL,
        ));

      subscription.plan = dto.plan;
      subscription.amountCents = getDefaultAmountCents(
        dto.plan,
        subscription.billingCycle,
      );
      await this.subscriptionRepository.save(subscription);
      organization.subscription = subscription;
    }

    return mapOrganizationResponse(
      organization,
      organization.users?.length ?? 0,
    );
  }

  async remove(id: string) {
    const organization = await this.organizationRepository.findOne({
      where: { id },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    await this.userRepository.delete({ organizationId: id });
    await this.subscriptionRepository.delete({ organizationId: id });
    await this.organizationRepository.delete(id);

    return {
      message: `${organization.name} deleted successfully.`,
    };
  }

  async getCurrentOrganization(
    user: JwtPayload,
  ): Promise<WorkspaceOrganizationResponse> {
    const organization = await this.getOrganizationForUser(
      user.organizationId!,
    );
    const usersCount = organization.users?.length ?? 0;

    return mapWorkspaceOrganizationResponse(organization, usersCount);
  }

  async updateCurrentOrganization(
    user: JwtPayload,
    dto: UpdateWorkspaceOrganizationDto,
  ): Promise<WorkspaceOrganizationResponse> {
    const organization = await this.getOrganizationForUser(
      user.organizationId!,
    );

    if (dto.slug && dto.slug !== organization.slug) {
      organization.slug = await this.resolveUniqueSlug(
        dto.slug,
        organization.id,
      );
    }

    if (dto.name) {
      organization.name = dto.name.trim();
    }

    if (dto.billingEmail !== undefined) {
      organization.billingEmail = dto.billingEmail.trim().toLowerCase();
    }

    if (dto.workspaceSettings) {
      const wasTwoFactorRequired =
        organization.workspaceSettings?.twoFactorRequired ?? false;

      organization.workspaceSettings = mergeOrganizationWorkspaceSettings(
        organization.workspaceSettings,
        dto.workspaceSettings,
      );

      if (
        !wasTwoFactorRequired &&
        organization.workspaceSettings.twoFactorRequired
      ) {
        if (
          !organization.twoFactorConfigured ||
          !organization.twoFactorSecret
        ) {
          throw new BadRequestException(
            'Configure the workspace authenticator below before requiring two-factor authentication.',
          );
        }
      }
    }

    await this.organizationRepository.save(organization);

    return mapWorkspaceOrganizationResponse(
      organization,
      organization.users?.length ?? 0,
    );
  }

  async getOrganizationTwoFactorStatus(user: JwtPayload) {
    const organization = await this.getOrganizationForUser(
      user.organizationId!,
    );

    return {
      configured: organization.twoFactorConfigured,
      requiredByWorkspace:
        organization.workspaceSettings?.twoFactorRequired ?? false,
      pendingSetup: Boolean(
        organization.twoFactorSecret && !organization.twoFactorConfigured,
      ),
    };
  }

  async setupOrganizationTwoFactor(user: JwtPayload) {
    const organization = await this.getOrganizationForUser(
      user.organizationId!,
    );
    const secret = generateTwoFactorSecret();

    organization.twoFactorSecret = secret;
    organization.twoFactorConfigured = false;
    await this.organizationRepository.save(organization);

    return {
      secret,
      otpauthUrl: buildTwoFactorOtpAuthUrl(
        `${organization.name} Workspace`,
        secret,
      ),
    };
  }

  async confirmOrganizationTwoFactor(user: JwtPayload, code: string) {
    const organization = await this.getOrganizationForUser(
      user.organizationId!,
    );

    if (!organization.twoFactorSecret) {
      throw new BadRequestException(
        'Start workspace two-factor setup before confirming it.',
      );
    }

    if (!(await verifyTwoFactorCode(organization.twoFactorSecret, code))) {
      throw new UnauthorizedException('Invalid authentication code.');
    }

    organization.twoFactorConfigured = true;
    await this.organizationRepository.save(organization);

    return {
      message: 'Workspace authenticator configured successfully.',
      configured: true,
    };
  }

  async listCurrentMembers(
    user: JwtPayload,
    query: ListMembersQueryDto = {},
  ): Promise<OrganizationMembersSummaryResponse> {
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
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );
    const planCode = organization.subscription?.plan ?? PlanCode.FREE;

    return mapOrganizationMembersSummary(members, planCode, query);
  }

  async getOrganizationAbout(
    user: JwtPayload,
  ): Promise<OrganizationAboutResponse> {
    if (user.role !== RegisterAs.MANAGER && user.role !== RegisterAs.MEMBER) {
      throw new ForbiddenException(
        'Organization overview is only available for managers and members.',
      );
    }

    const organization = await this.getOrganizationForUser(
      user.organizationId!,
    );
    const members = organization.users ?? [];

    const owner = members.find(
      (member) =>
        member.role === RegisterAs.OWNER &&
        member.accountStatus !== AccountStatus.SUSPENDED,
    );

    if (!owner) {
      throw new NotFoundException('Organization owner not found.');
    }

    const admins = members
      .filter(
        (member) =>
          member.role === RegisterAs.ADMIN &&
          member.accountStatus !== AccountStatus.SUSPENDED,
      )
      .sort((left, right) => left.fullName.localeCompare(right.fullName));

    let managerList: User[];

    if (user.role === RegisterAs.MANAGER) {
      const self = members.find((member) => member.id === user.sub);

      if (!self || self.accountStatus === AccountStatus.SUSPENDED) {
        throw new NotFoundException('Your workspace profile was not found.');
      }

      managerList = [self];
    } else {
      managerList = await this.projectsService.getProjectManagersForMember(
        user.sub,
        user.organizationId!,
      );
    }

    return {
      organization: {
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        createdAt: organization.createdAt.toISOString(),
      },
      owner: mapOrganizationAboutPersonResponse(owner),
      admins: {
        count: admins.length,
        data: admins.map(mapOrganizationAboutPersonResponse),
      },
      managers: {
        count: managerList.length,
        data: managerList.map(mapOrganizationAboutPersonResponse),
      },
    };
  }

  async updateMemberRole(
    actor: JwtPayload,
    memberId: string,
    role: RegisterAs,
  ): Promise<OrganizationMemberResponse> {
    this.ensureAssignableRole(role);

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

    member.role = role;
    await this.userRepository.save(member);

    await this.activityService.recordForUser(actor, {
      module: ActivityModule.MEMBERS,
      action: ActivityAction.ROLE_CHANGED,
      summary: `Changed role for ${member.fullName}`,
      targetLabel: member.fullName,
      resourceType: 'user',
      resourceId: member.id,
      metadata: { role },
    });

    return mapOrganizationMemberResponse(member);
  }

  async updateMemberEmail(
    actor: JwtPayload,
    memberId: string,
    email: string,
  ): Promise<OrganizationMemberResponse> {
    const member = await this.getOrganizationMember(
      actor.organizationId!,
      memberId,
    );

    if (member.id === actor.sub) {
      throw new BadRequestException(
        'You cannot change your own email from member settings.',
      );
    }

    if (member.role === RegisterAs.OWNER) {
      throw new ForbiddenException(
        'The organization owner email cannot be changed here.',
      );
    }

    if (!canActorChangeMemberEmail(actor.role, member.role)) {
      throw new ForbiddenException(
        "You do not have permission to change this member's email.",
      );
    }

    const newEmail = email.trim().toLowerCase();

    if (newEmail === member.email) {
      throw new BadRequestException(
        'New email must be different from the current email.',
      );
    }

    const existingUser = await this.userRepository.findOne({
      where: { email: newEmail },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists.');
    }

    member.email = newEmail;
    member.emailVerificationStatus = EmailVerificationStatus.VERIFIED;
    await this.userRepository.save(member);

    await this.activityService.recordForUser(actor, {
      module: ActivityModule.MEMBERS,
      action: ActivityAction.EMAIL_CHANGED,
      summary: `Updated email for ${member.fullName}`,
      targetLabel: member.fullName,
      resourceType: 'user',
      resourceId: member.id,
      metadata: { email: newEmail },
    });

    return mapOrganizationMemberResponse(member);
  }

  async removeMember(actor: JwtPayload, memberId: string) {
    const member = await this.getOrganizationMember(
      actor.organizationId!,
      memberId,
    );

    if (member.id === actor.sub) {
      throw new BadRequestException(
        'You cannot remove yourself from the organization.',
      );
    }

    if (member.role === RegisterAs.OWNER) {
      throw new ForbiddenException('The organization owner cannot be removed.');
    }

    member.accountStatus = AccountStatus.SUSPENDED;
    await this.userRepository.save(member);

    await this.activityService.recordForUser(actor, {
      module: ActivityModule.MEMBERS,
      action: ActivityAction.REMOVED,
      summary: `Deactivated ${member.fullName}`,
      targetLabel: member.fullName,
      resourceType: 'user',
      resourceId: member.id,
    });

    return {
      message: `${member.fullName} has been deactivated.`,
    };
  }

  async createDefaultSubscriptionForOrganization(
    organizationId: string,
    billingEmail: string,
  ) {
    const existing = await this.subscriptionRepository.findOne({
      where: { organizationId },
    });

    if (existing) {
      return existing;
    }

    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    organization.status = OrganizationStatus.TRIAL;
    organization.billingEmail = billingEmail;
    await this.organizationRepository.save(organization);

    return this.createSubscriptionForOrganization(
      organizationId,
      PlanCode.FREE,
      SubscriptionStatus.TRIAL,
      null,
    );
  }

  private async createSubscriptionForOrganization(
    organizationId: string,
    plan: PlanCode,
    status: SubscriptionStatus,
    planSelectedAt: Date | null = new Date(),
  ) {
    const billingCycle = BillingCycle.MONTHLY;
    const dates =
      status === SubscriptionStatus.TRIAL
        ? buildTrialSubscriptionDates()
        : buildActiveSubscriptionDates(billingCycle);

    return this.subscriptionRepository.save(
      this.subscriptionRepository.create({
        organizationId,
        plan,
        status,
        billingCycle,
        amountCents: getDefaultAmountCents(plan, billingCycle),
        currency: 'USD',
        renewalDate: dates.renewalDate,
        startedAt: dates.startedAt,
        expiresAt: dates.expiresAt,
        trialEndsAt: dates.trialEndsAt,
        cancelledAt: null,
        planSelectedAt,
      }),
    );
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
      throw new NotFoundException('Organization member not found.');
    }

    return member;
  }

  private ensureAssignableRole(role: RegisterAs) {
    if (!ASSIGNABLE_MEMBER_ROLES.includes(role)) {
      throw new BadRequestException('Invalid member role.');
    }
  }

  private async getOrganizationWithRelations(id: string) {
    const organization = await this.organizationRepository.findOne({
      where: { id },
      relations: { subscription: true, users: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    return organization;
  }

  private async resolveUniqueSlug(slug: string, excludeId?: string) {
    const normalized = slugifyOrganizationName(slug);
    let candidate = normalized || 'organization';
    let suffix = 1;

    while (await this.slugExists(candidate, excludeId)) {
      candidate = `${normalized}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  private async slugExists(slug: string, excludeId?: string) {
    const existing = await this.organizationRepository.findOne({
      where: { slug },
    });

    return Boolean(existing && existing.id !== excludeId);
  }

  private async ensureOwnerEmailAvailable(email: string) {
    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('A user with this email already exists.');
    }
  }
}
