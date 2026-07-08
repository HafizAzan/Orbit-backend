import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  mapNotificationResponse,
  type NotificationResponse,
} from '../common/mappers/notification.mapper';
import { Notification } from '../entities/notification.entity';
import { NotificationKind } from '../enum/notification.enum';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { RealtimeService } from '../realtime/realtime.service';

type CreateNotificationInput = {
  userId: string;
  organizationId: string;
  kind: NotificationKind;
  title: string;
  message: string;
  href?: string | null;
  resourceType?: string | null;
  resourceId?: string | null;
};

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly realtimeService: RealtimeService,
  ) {}

  async listForUser(user: JwtPayload, limit = 20) {
    const notifications = await this.notificationRepository.find({
      where: { userId: user.sub },
      order: { createdAt: 'DESC' },
      take: limit,
    });

    return notifications.map(mapNotificationResponse);
  }

  async getUnreadCount(user: JwtPayload) {
    const count = await this.notificationRepository.count({
      where: { userId: user.sub, read: false },
    });

    return { count };
  }

  async markAsRead(user: JwtPayload, notificationId: string) {
    const notification = await this.notificationRepository.findOne({
      where: { id: notificationId, userId: user.sub },
    });

    if (!notification) {
      return { message: 'Notification not found.' };
    }

    notification.read = true;
    await this.notificationRepository.save(notification);

    return mapNotificationResponse(notification);
  }

  async markAllAsRead(user: JwtPayload) {
    await this.notificationRepository.update(
      { userId: user.sub, read: false },
      { read: true },
    );

    return { message: 'All notifications marked as read.' };
  }

  async createAndPush(
    input: CreateNotificationInput,
  ): Promise<NotificationResponse> {
    const saved = await this.notificationRepository.save(
      this.notificationRepository.create({
        userId: input.userId,
        organizationId: input.organizationId,
        kind: input.kind,
        title: input.title,
        message: input.message,
        href: input.href ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        read: false,
      }),
    );

    const response = mapNotificationResponse(saved);
    this.realtimeService.emitToUser(
      input.userId,
      'notification:created',
      response,
    );

    return response;
  }

  async notifyProjectMembers(params: {
    organizationId: string;
    projectId: string;
    projectName: string;
    actorUserId: string;
    memberUserIds: string[];
    title: string;
    message: string;
    href: string;
  }) {
    const recipients = params.memberUserIds.filter(
      (userId) => userId !== params.actorUserId,
    );

    await Promise.all(
      recipients.map((userId) =>
        this.createAndPush({
          userId,
          organizationId: params.organizationId,
          kind: NotificationKind.COMMENT,
          title: params.title,
          message: params.message,
          href: params.href,
          resourceType: 'project',
          resourceId: params.projectId,
        }),
      ),
    );
  }

  async notifyProjectMembership(params: {
    organizationId: string;
    projectId: string;
    projectName: string;
    actorUserId: string;
    actorName: string;
    memberUserIds: string[];
  }) {
    const recipients = params.memberUserIds.filter(
      (userId) => userId !== params.actorUserId,
    );

    await Promise.all(
      recipients.map((userId) =>
        this.createAndPush({
          userId,
          organizationId: params.organizationId,
          kind: NotificationKind.PROJECT,
          title: 'Added to project',
          message: `${params.actorName} added you to the project "${params.projectName}".`,
          href: `/projects/${params.projectId}`,
          resourceType: 'project',
          resourceId: params.projectId,
        }),
      ),
    );
  }

  async notifyTaskAssigned(params: {
    organizationId: string;
    assigneeId: string;
    actorUserId: string;
    actorName: string;
    taskId: string;
    taskTitle: string;
    projectName: string;
  }) {
    if (!params.assigneeId || params.assigneeId === params.actorUserId) {
      return;
    }

    await this.createAndPush({
      userId: params.assigneeId,
      organizationId: params.organizationId,
      kind: NotificationKind.TASK,
      title: 'Task assigned to you',
      message: `${params.actorName} assigned "${params.taskTitle}" in ${params.projectName} to you.`,
      href: `/tasks/${params.taskId}`,
      resourceType: 'task',
      resourceId: params.taskId,
    });
  }

  async notifyInviteAccepted(params: {
    organizationId: string;
    inviterUserId: string;
    memberUserId: string;
    memberName: string;
  }) {
    if (params.inviterUserId === params.memberUserId) {
      return;
    }

    await this.createAndPush({
      userId: params.inviterUserId,
      organizationId: params.organizationId,
      kind: NotificationKind.TEAM,
      title: 'Invite accepted',
      message: `${params.memberName} accepted your team invitation and joined the workspace.`,
      href: '/teams',
      resourceType: 'user',
      resourceId: params.memberUserId,
    });
  }
}
