import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomBytes, timingSafeEqual } from 'crypto';
import { Repository } from 'typeorm';
import { ActivityService } from '../activity/activity.service';
import { ActivityAction, ActivityModule } from '../enum/activity.enum';
import { RegisterAs } from '../enum/auth.enum';
import { Project } from '../entities/project.entity';
import { User } from '../entities/user.entity';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class GitHubIntegrationService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(forwardRef(() => ActivityService))
    private readonly activityService: ActivityService,
    @Inject(forwardRef(() => ProjectsService))
    private readonly projectsService: ProjectsService,
    private readonly configService: ConfigService,
  ) {}

  async linkProjectRepo(
    user: JwtPayload,
    projectId: string,
    repoFullName: string | null | undefined,
    unlink?: boolean,
  ) {
    const project = await this.projectsService.ensureAccessibleProject(
      user,
      projectId,
      true,
    );

    if (unlink || repoFullName === null) {
      project.githubRepoFullName = null;
      project.githubWebhookSecret = null;
      await this.projectRepository.save(project);
      return {
        message: 'GitHub repository unlinked.',
        githubRepoFullName: null,
        githubWebhookSecret: null,
        webhookUrl: null,
      };
    }

    const normalized = repoFullName?.trim();
    if (!normalized) {
      throw new BadRequestException('Repository full name is required.');
    }

    const secret = randomBytes(24).toString('hex');
    project.githubRepoFullName = normalized;
    project.githubWebhookSecret = secret;
    await this.projectRepository.save(project);

    return {
      message: 'GitHub repository linked. Add this webhook secret in GitHub.',
      githubRepoFullName: project.githubRepoFullName,
      githubWebhookSecret: secret,
      webhookUrl: this.getWebhookUrl(),
    };
  }

  async getProjectStatus(user: JwtPayload, projectId: string) {
    const project = await this.projectsService.ensureAccessibleProject(
      user,
      projectId,
      false,
    );

    if (!project.githubRepoFullName) {
      return {
        linked: false,
        repoFullName: null,
        webhookUrl: this.getWebhookUrl(),
        commits: [],
        pullRequests: [],
        checks: [],
      };
    }

    const token = await this.resolveGitHubToken(user.sub);
    if (!token) {
      return {
        linked: true,
        repoFullName: project.githubRepoFullName,
        webhookUrl: this.getWebhookUrl(),
        commits: [],
        pullRequests: [],
        checks: [],
        warning:
          'No GitHub token available. Sign in with GitHub or set GITHUB_TOKEN.',
      };
    }

    const [owner, repo] = project.githubRepoFullName.split('/');
    const headers = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'Orbit',
    };

    const [commitsRes, prsRes, checksRes] = await Promise.all([
      fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits?per_page=5`,
        { headers },
      ),
      fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls?state=open&per_page=5`,
        { headers },
      ),
      fetch(
        `https://api.github.com/repos/${owner}/${repo}/commits/HEAD/check-runs?per_page=5`,
        { headers },
      ),
    ]);

    const commits = commitsRes.ok
      ? ((await commitsRes.json()) as Array<{
          sha: string;
          html_url: string;
          commit: { message: string; author: { name: string; date: string } };
        }>).map((item) => ({
          sha: item.sha.slice(0, 7),
          message: item.commit.message.split('\n')[0],
          author: item.commit.author?.name ?? 'Unknown',
          url: item.html_url,
          committedAt: item.commit.author?.date ?? new Date().toISOString(),
        }))
      : [];

    const pullRequests = prsRes.ok
      ? ((await prsRes.json()) as Array<{
          number: number;
          title: string;
          html_url: string;
          state: string;
          user: { login: string };
          updated_at: string;
        }>).map((item) => ({
          number: item.number,
          title: item.title,
          url: item.html_url,
          state: item.state,
          author: item.user?.login ?? 'Unknown',
          updatedAt: item.updated_at,
        }))
      : [];

    const checksPayload = checksRes.ok
      ? ((await checksRes.json()) as {
          check_runs?: Array<{
            name: string;
            status: string;
            conclusion: string | null;
            html_url: string | null;
          }>;
        })
      : { check_runs: [] };

    const checks = (checksPayload.check_runs ?? []).slice(0, 5).map((item) => ({
      name: item.name,
      status: item.status,
      conclusion: item.conclusion,
      url: item.html_url ?? '',
    }));

    return {
      linked: true,
      repoFullName: project.githubRepoFullName,
      webhookUrl: this.getWebhookUrl(),
      commits,
      pullRequests,
      checks,
    };
  }

  async handleWebhook(input: {
    rawBody: Buffer;
    signature?: string;
    eventName: string;
    payload: Record<string, unknown>;
  }) {
    const repo = input.payload.repository as
      | { full_name?: string }
      | undefined;
    const fullName = repo?.full_name;
    if (!fullName) {
      return { ignored: true, reason: 'missing repository' };
    }

    const project = await this.projectRepository.findOne({
      where: { githubRepoFullName: fullName },
    });

    if (!project?.githubWebhookSecret) {
      throw new NotFoundException('No project linked to this repository.');
    }

    this.verifySignature(
      input.rawBody,
      input.signature,
      project.githubWebhookSecret,
    );

    const sender = input.payload.sender as { login?: string } | undefined;
    const actorName = sender?.login ?? 'GitHub';

    if (input.eventName === 'push') {
      const commits = (input.payload.commits as Array<{ message?: string }>) ?? [];
      const ref = String(input.payload.ref ?? '');
      const branch = ref.replace('refs/heads/', '');
      const actorRole = await this.resolveActorRole(project.createdById);
      await this.activityService.record({
        organizationId: project.organizationId,
        actorId: project.createdById,
        actorName,
        actorRole,
        module: ActivityModule.GITHUB,
        action: ActivityAction.PUSHED,
        summary: `${actorName} pushed ${commits.length || 1} commit(s) to ${branch || 'branch'}`,
        targetLabel: project.githubRepoFullName,
        resourceType: 'github_push',
        resourceId: null,
        projectId: project.id,
        metadata: {
          event: 'push',
          branch,
          compareUrl: input.payload.compare ?? null,
          commitCount: commits.length,
        },
      });
      return { ok: true, event: 'push' };
    }

    if (input.eventName === 'pull_request') {
      const action = String(input.payload.action ?? '');
      const pr = input.payload.pull_request as {
        number?: number;
        title?: string;
        html_url?: string;
        merged?: boolean;
      };
      let activityAction = ActivityAction.UPDATED;
      if (action === 'opened') activityAction = ActivityAction.OPENED;
      if (action === 'closed' && pr?.merged) activityAction = ActivityAction.MERGED;
      if (action === 'closed' && !pr?.merged) activityAction = ActivityAction.CLOSED;

      const actorRole = await this.resolveActorRole(project.createdById);

      await this.activityService.record({
        organizationId: project.organizationId,
        actorId: project.createdById,
        actorName,
        actorRole,
        module: ActivityModule.GITHUB,
        action: activityAction,
        summary: `${actorName} ${action} PR #${pr?.number ?? ''} ${pr?.title ?? ''}`.trim(),
        targetLabel: `PR #${pr?.number ?? ''}`,
        resourceType: 'github_pull_request',
        resourceId: null,
        projectId: project.id,
        metadata: {
          event: 'pull_request',
          action,
          number: pr?.number ?? null,
          url: pr?.html_url ?? null,
          merged: pr?.merged ?? false,
        },
      });
      return { ok: true, event: 'pull_request' };
    }

    if (input.eventName === 'check_run' || input.eventName === 'check_suite') {
      const checkRun = (input.payload.check_run ??
        input.payload.check_suite) as {
        name?: string;
        status?: string;
        conclusion?: string | null;
        html_url?: string;
      };
      const actorRole = await this.resolveActorRole(project.createdById);

      await this.activityService.record({
        organizationId: project.organizationId,
        actorId: project.createdById,
        actorName,
        actorRole,
        module: ActivityModule.GITHUB,
        action: ActivityAction.CHECK_COMPLETED,
        summary: `CI ${checkRun?.name ?? 'check'} ${checkRun?.conclusion ?? checkRun?.status ?? 'updated'}`,
        targetLabel: checkRun?.name ?? 'check',
        resourceType: 'github_check',
        resourceId: null,
        projectId: project.id,
        metadata: {
          event: input.eventName,
          status: checkRun?.status ?? null,
          conclusion: checkRun?.conclusion ?? null,
          url: checkRun?.html_url ?? null,
        },
      });
      return { ok: true, event: input.eventName };
    }

    return { ignored: true, reason: `unhandled event ${input.eventName}` };
  }

  private async resolveActorRole(userId: string) {
    const actor = await this.userRepository.findOne({ where: { id: userId } });
    return actor?.role ?? RegisterAs.OWNER;
  }

  private verifySignature(
    rawBody: Buffer,
    signature: string | undefined,
    secret: string,
  ) {
    if (!signature?.startsWith('sha256=')) {
      throw new BadRequestException('Missing GitHub signature.');
    }

    const digest = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expected = Buffer.from(`sha256=${digest}`);
    const actual = Buffer.from(signature);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new BadRequestException('Invalid GitHub signature.');
    }
  }

  private async resolveGitHubToken(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    return (
      user?.githubAccessToken ||
      this.configService.get<string>('GITHUB_TOKEN') ||
      null
    );
  }

  private getWebhookUrl() {
    const port = this.configService.get<number>('PORT', 5000);
    const frontend = this.configService.get<string>('FRONTEND_URL', '');
    // Prefer explicit API origin from callback if set
    const callback = this.configService.get<string>('GITHUB_CALLBACK_URL');
    if (callback) {
      try {
        const url = new URL(callback);
        return `${url.origin}/api/v1/webhooks/github`;
      } catch {
        // fall through
      }
    }
    if (frontend.includes('localhost')) {
      return `http://localhost:${port}/api/v1/webhooks/github`;
    }
    return `/api/v1/webhooks/github`;
  }
}
