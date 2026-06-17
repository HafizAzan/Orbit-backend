import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
  mapWorkspaceOrganizationResponse,
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
import { ProjectsService } from '../projects/projects.service';
import { hasOrgWideProjectAccess } from '../projects/project-access.util';

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
  ) {}

  async findAll(): Promise<OrganizationResponse[]> {
    const organizations = await this.organizationRepository.find({
      relations: { subscription: true, users: true },
      order: { createdAt: 'DESC' },
    });

    return organizations.map((organization) =>
      mapOrganizationResponse(organization, organization.users?.length ?? 0),
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
    const slug = await this.resolveUniqueSlug(dto.slug ?? slugifyOrganizationName(dto.name));
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

  async update(id: string, dto: UpdateOrganizationDto): Promise<OrganizationResponse> {
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

    if (dto.billingEmail) {
      organization.billingEmail = dto.billingEmail.trim().toLowerCase();
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
    const organization = await this.getOrganizationForUser(user.organizationId!);
    const usersCount = organization.users?.length ?? 0;

    return mapWorkspaceOrganizationResponse(organization, usersCount);
  }

  async updateCurrentOrganization(
    user: JwtPayload,
    dto: UpdateWorkspaceOrganizationDto,
  ): Promise<WorkspaceOrganizationResponse> {
    const organization = await this.getOrganizationForUser(user.organizationId!);

    if (dto.slug && dto.slug !== organization.slug) {
      organization.slug = await this.resolveUniqueSlug(dto.slug, organization.id);
    }

    if (dto.name) {
      organization.name = dto.name.trim();
    }

    if (dto.billingEmail !== undefined) {
      organization.billingEmail = dto.billingEmail.trim().toLowerCase();
    }

    await this.organizationRepository.save(organization);

    return mapWorkspaceOrganizationResponse(
      organization,
      organization.users?.length ?? 0,
    );
  }

  async listCurrentMembers(
    user: JwtPayload,
  ): Promise<OrganizationMembersSummaryResponse> {
    const organization = await this.getOrganizationForUser(user.organizationId!);
    let members = [...(organization.users ?? [])];

    if (!hasOrgWideProjectAccess(user.role)) {
      const squadIds = await this.projectsService.getSquadUserIds(user);
      members = members.filter((member) => squadIds.has(member.id));
    }

    members.sort(
      (left, right) => left.createdAt.getTime() - right.createdAt.getTime(),
    );
    const planCode = organization.subscription?.plan ?? PlanCode.FREE;

    return mapOrganizationMembersSummary(members, planCode);
  }

  async updateMemberRole(
    actor: JwtPayload,
    memberId: string,
    role: RegisterAs,
  ): Promise<OrganizationMemberResponse> {
    this.ensureAssignableRole(role);

    const member = await this.getOrganizationMember(actor.organizationId!, memberId);

    if (member.id === actor.sub) {
      throw new BadRequestException('You cannot change your own role.');
    }

    if (member.role === RegisterAs.OWNER) {
      throw new ForbiddenException('The organization owner role cannot be changed.');
    }

    member.role = role;
    await this.userRepository.save(member);

    return mapOrganizationMemberResponse(member);
  }

  async removeMember(actor: JwtPayload, memberId: string) {
    const member = await this.getOrganizationMember(actor.organizationId!, memberId);

    if (member.id === actor.sub) {
      throw new BadRequestException('You cannot remove yourself from the organization.');
    }

    if (member.role === RegisterAs.OWNER) {
      throw new ForbiddenException('The organization owner cannot be removed.');
    }

    member.accountStatus = AccountStatus.SUSPENDED;
    await this.userRepository.save(member);

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

  private async getOrganizationMember(organizationId: string, memberId: string) {
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
