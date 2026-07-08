import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual, Not } from 'typeorm';
import { EmailService } from '../email/email.service';
import { ActivityEvent } from '../entities/activity-event.entity';
import { Organization } from '../entities/organization.entity';
import { Task } from '../entities/task.entity';
import { User } from '../entities/user.entity';
import { AccountStatus, EmailVerificationStatus } from '../enum/auth.enum';
import { TaskStatus } from '../enum/task.enum';
import { NotificationKind } from '../enum/notification.enum';
import {
  DEFAULT_ORGANIZATION_WORKSPACE_SETTINGS,
  type OrganizationWorkspaceSettings,
} from '../common/types/organization-workspace-settings.type';
import { NotificationsService } from '../notifications/notifications.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class NotificationDigestService {
  private readonly logger = new Logger(NotificationDigestService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
    private readonly notificationsService: NotificationsService,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Task)
    private readonly taskRepository: Repository<Task>,
    @InjectRepository(ActivityEvent)
    private readonly activityRepository: Repository<ActivityEvent>,
  ) {}

  async sendDailyDigests() {
    const organizations = await this.organizationRepository.find({
      relations: { users: true },
    });

    for (const organization of organizations) {
      const settings = this.resolveSettings(organization.workspaceSettings);
      if (!settings.dailyDigest) continue;

      const recipients = this.getActiveMembers(organization.users);
      if (recipients.length === 0) continue;

      const today = new Date().toISOString().slice(0, 10);
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const [tasksDueToday, openTasks, recentActivity] = await Promise.all([
        this.taskRepository.count({
          where: {
            organizationId: organization.id,
            dueDate: today,
            status: Not(TaskStatus.DONE),
          },
        }),
        this.taskRepository.count({
          where: {
            organizationId: organization.id,
            status: Not(TaskStatus.DONE),
          },
        }),
        this.activityRepository.count({
          where: {
            organizationId: organization.id,
            createdAt: MoreThanOrEqual(since),
          },
        }),
      ]);

      const frontendUrl = this.configService.get<string>(
        'FRONTEND_URL',
        'http://localhost:5173',
      );

      for (const member of recipients) {
        try {
          await this.emailService.sendDailyDigestEmail({
            to: member.email,
            fullName: member.fullName,
            workspaceName: organization.name,
            tasksDueToday,
            openTasks,
            recentActivity,
            dashboardUrl: `${frontendUrl}/dashboard`,
          });

          if (settings.realtimePush) {
            await this.notificationsService.createAndPush({
              userId: member.id,
              organizationId: organization.id,
              kind: NotificationKind.TEAM,
              title: 'Daily digest sent',
              message: `${tasksDueToday} tasks due today, ${openTasks} open tasks, ${recentActivity} recent updates.`,
              href: '/dashboard',
            });
          }
        } catch (error) {
          this.logger.warn(
            `Failed daily digest for ${member.email}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }
    }
  }

  async sendWeeklyReports() {
    const organizations = await this.organizationRepository.find({
      relations: { users: true },
    });

    for (const organization of organizations) {
      const settings = this.resolveSettings(organization.workspaceSettings);
      if (!settings.weeklyReport) continue;

      const recipients = this.getActiveMembers(organization.users);
      if (recipients.length === 0) continue;

      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [completedTasks, createdTasks] = await Promise.all([
        this.taskRepository.count({
          where: {
            organizationId: organization.id,
            status: TaskStatus.DONE,
            updatedAt: MoreThanOrEqual(since),
          },
        }),
        this.taskRepository.count({
          where: {
            organizationId: organization.id,
            createdAt: MoreThanOrEqual(since),
          },
        }),
      ]);

      const activeMembers = recipients.filter(
        (member) =>
          member.lastActiveAt && member.lastActiveAt.getTime() >= since.getTime(),
      ).length;

      const frontendUrl = this.configService.get<string>(
        'FRONTEND_URL',
        'http://localhost:5173',
      );

      for (const member of recipients) {
        try {
          await this.emailService.sendWeeklyReportEmail({
            to: member.email,
            fullName: member.fullName,
            workspaceName: organization.name,
            completedTasks,
            createdTasks,
            activeMembers,
            reportsUrl: `${frontendUrl}/reports`,
          });

          if (settings.realtimePush) {
            await this.notificationsService.createAndPush({
              userId: member.id,
              organizationId: organization.id,
              kind: NotificationKind.TEAM,
              title: 'Weekly workspace report',
              message: `${completedTasks} tasks completed and ${createdTasks} created this week.`,
              href: '/reports',
            });
          }
        } catch (error) {
          this.logger.warn(
            `Failed weekly report for ${member.email}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          );
        }
      }
    }
  }

  private resolveSettings(
    settings: OrganizationWorkspaceSettings | null | undefined,
  ) {
    return settings ?? DEFAULT_ORGANIZATION_WORKSPACE_SETTINGS;
  }

  private getActiveMembers(users: User[] = []) {
    return users.filter(
      (user) =>
        user.accountStatus === AccountStatus.ACTIVE &&
        user.emailVerificationStatus === EmailVerificationStatus.VERIFIED &&
        !user.isPlatformAdmin,
    );
  }
}
