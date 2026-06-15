import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  buildActiveSubscriptionDates,
  buildTrialSubscriptionDates,
  getDefaultAmountCents,
} from '../common/utils/billing.util';
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

    return {
      total: organizations.length,
      active: organizations.filter((org) => org.status === OrganizationStatus.ACTIVE).length,
      trial: organizations.filter((org) => org.status === OrganizationStatus.TRIAL).length,
      suspended: organizations.filter((org) => org.status === OrganizationStatus.SUSPENDED).length,
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

    await this.organizationRepository.delete(id);

    return {
      message: `${organization.name} deleted successfully.`,
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
    );
  }

  private async createSubscriptionForOrganization(
    organizationId: string,
    plan: PlanCode,
    status: SubscriptionStatus,
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
        planSelectedAt: new Date(),
      }),
    );
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
