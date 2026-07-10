import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { ContentModerationService } from '../common/services/content-moderation.service';
import { ActivityEvent } from '../entities/activity-event.entity';
import { Organization } from '../entities/organization.entity';
import { Subscription } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';
import { AccountStatus } from '../enum/auth.enum';
import { OrganizationStatus, SubscriptionStatus } from '../enum/billing.enum';
import { CursorProvider } from './providers/cursor.provider';
import { buildPrompt } from './prompts/prompt-builder';
import {
  ASK_PLATFORM_PROMPT,
  DESCRIBE_PLATFORM_ACTIVITY_PROMPT,
  ORG_HEALTH_PROMPT,
} from './prompts/platform.prompts';
import {
  extractJsonPayload,
  validateActivityDescribe,
  validateAskWorkspace,
  validateProjectSummary,
} from './validators/ai-response.validator';
import type {
  AskPlatformDto,
  DescribePlatformActivityDto,
  OrgHealthDto,
} from './dto/platform-ai.dto';

@Injectable()
export class AdminAiService {
  constructor(
    private readonly cursorProvider: CursorProvider,
    private readonly contentModerationService: ContentModerationService,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(ActivityEvent)
    private readonly activityRepository: Repository<ActivityEvent>,
  ) {}

  async askPlatform(user: JwtPayload, dto: AskPlatformDto) {
    await this.contentModerationService.assertCleanContent(user.sub, {
      question: dto.question,
    });

    const [organizations, users, subscriptions, recentActivity] =
      await Promise.all([
        this.organizationRepository.find({
          relations: { subscription: true },
          order: { createdAt: 'DESC' },
          take: 40,
        }),
        this.userRepository.count({ where: { isPlatformAdmin: false } }),
        this.subscriptionRepository.find({ take: 40 }),
        this.activityRepository.find({
          order: { createdAt: 'DESC' },
          take: 20,
        }),
      ]);

    const activeUsers = await this.userRepository.count({
      where: { isPlatformAdmin: false, accountStatus: AccountStatus.ACTIVE },
    });

    const monthlyRevenue = subscriptions
      .filter((item) => item.status === SubscriptionStatus.ACTIVE)
      .reduce((sum, item) => sum + item.amountCents / 100, 0);

    const platformContext = JSON.stringify(
      {
        totals: {
          organizations: organizations.length,
          users,
          activeUsers,
          subscriptions: subscriptions.length,
          monthlyRevenue,
        },
        organizations: organizations.map((org) => ({
          id: org.id,
          name: org.name,
          status: org.status,
          plan: org.subscription?.plan ?? 'FREE',
          users: undefined,
          createdAt: org.createdAt,
        })),
        recentActivity: recentActivity.map((event) => ({
          summary: event.summary,
          module: event.module,
          actor: event.actorName,
          reviewStatus: event.reviewStatus,
          createdAt: event.createdAt,
        })),
      },
      null,
      2,
    );

    const prompt = buildPrompt(ASK_PLATFORM_PROMPT, {
      language: dto.language,
      workspaceName: 'Orbit Platform',
      role: 'platform_admin',
      variables: {
        question: dto.question.trim(),
        platformContext,
      },
    });

    const raw = await this.cursorProvider.generateText(prompt);
    const draft = validateAskWorkspace(this.parseAiJson(raw));

    return {
      message: 'AI platform answer generated successfully.',
      draft,
    };
  }

  async orgHealth(_user: JwtPayload, dto: OrgHealthDto) {
    const organization = await this.organizationRepository.findOne({
      where: { id: dto.organizationId },
      relations: { subscription: true, users: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    const users = organization.users ?? [];
    const activeUsers = users.filter(
      (member) => member.accountStatus === AccountStatus.ACTIVE,
    ).length;
    const pendingUsers = users.filter(
      (member) => member.accountStatus === AccountStatus.PENDING,
    ).length;
    const suspendedUsers = users.filter(
      (member) => member.accountStatus === AccountStatus.SUSPENDED,
    ).length;

    const recentActivity = await this.activityRepository.find({
      where: { organizationId: organization.id },
      order: { createdAt: 'DESC' },
      take: 15,
    });

    const orgContext = JSON.stringify(
      {
        organization: {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          status: organization.status,
          projectCount: organization.projectCount,
          createdAt: organization.createdAt,
        },
        subscription: organization.subscription
          ? {
              plan: organization.subscription.plan,
              status: organization.subscription.status,
              amountCents: organization.subscription.amountCents,
              billingCycle: organization.subscription.billingCycle,
              renewalDate: organization.subscription.renewalDate,
              trialEndsAt: organization.subscription.trialEndsAt,
            }
          : null,
        members: {
          total: users.length,
          active: activeUsers,
          pending: pendingUsers,
          suspended: suspendedUsers,
        },
        recentActivity: recentActivity.map((event) => ({
          summary: event.summary,
          module: event.module,
          action: event.action,
          reviewStatus: event.reviewStatus,
          createdAt: event.createdAt,
        })),
        signals: {
          isSuspended: organization.status === OrganizationStatus.SUSPENDED,
          isTrial: organization.status === OrganizationStatus.TRIAL,
        },
      },
      null,
      2,
    );

    const prompt = buildPrompt(ORG_HEALTH_PROMPT, {
      language: dto.language,
      workspaceName: organization.name,
      role: 'platform_admin',
      variables: {
        orgContext,
      },
    });

    const raw = await this.cursorProvider.generateText(prompt);
    const draft = validateProjectSummary(this.parseAiJson(raw));

    return {
      message: 'AI organization health generated successfully.',
      draft: {
        executiveSummary: draft.executiveSummary,
        healthScore: draft.healthScore,
        confidence: draft.confidence,
        riskLevel: draft.riskLevel,
        strengths: draft.completedHighlights ?? [],
        risks: draft.risks ?? [],
        recommendedNextActions: draft.recommendedNextActions ?? [],
        delayedItems: draft.delayedItems ?? [],
      },
    };
  }

  async describePlatformActivity(
    _user: JwtPayload,
    dto: DescribePlatformActivityDto,
  ) {
    const event = await this.activityRepository.findOne({
      where: { id: dto.activityId },
    });

    if (!event) {
      throw new NotFoundException('Activity event not found.');
    }

    const organization = await this.organizationRepository.findOne({
      where: { id: event.organizationId },
    });

    const activityContext = JSON.stringify(
      {
        id: event.id,
        organization: organization?.name ?? event.organizationId,
        module: event.module,
        action: event.action,
        summary: event.summary,
        targetLabel: event.targetLabel,
        actorName: event.actorName,
        actorRole: event.actorRole,
        reviewStatus: event.reviewStatus,
        flagReason: event.flagReason,
        flagNote: event.flagNote,
        createdAt: event.createdAt,
        metadata: event.metadata,
      },
      null,
      2,
    );

    const prompt = buildPrompt(DESCRIBE_PLATFORM_ACTIVITY_PROMPT, {
      language: dto.language,
      workspaceName: 'Orbit Platform',
      role: 'platform_admin',
      variables: {
        activityContext,
      },
    });

    const raw = await this.cursorProvider.generateText(prompt);
    const draft = validateActivityDescribe(this.parseAiJson(raw));

    return {
      message: 'AI platform activity description generated successfully.',
      draft,
    };
  }

  private parseAiJson(raw: string): unknown {
    try {
      return extractJsonPayload(raw);
    } catch {
      return JSON.parse(raw);
    }
  }
}
