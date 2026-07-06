import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

const PRESENCE_PING_THROTTLE_MS = 2 * 60 * 1000;
import type { Server, Socket } from 'socket.io';
import { Repository } from 'typeorm';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import { User } from '../entities/user.entity';
import { PresenceService } from './presence.service';

type AuthenticatedSocket = Socket & {
  user?: JwtPayload;
};

@Injectable()
@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/realtime',
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly lastActiveTouch = new Map<string, number>();

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly presenceService: PresenceService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        this.extractBearerToken(client.handshake.headers.authorization);

      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      client.user = payload;

      await client.join(this.userRoom(payload.sub));

      if (payload.organizationId) {
        await client.join(this.orgRoom(payload.organizationId));

        const wasOnline = this.presenceService.isUserOnline(
          payload.organizationId,
          payload.sub,
        );
        this.presenceService.userConnected(payload.organizationId, payload.sub);

        if (!wasOnline) {
          void this.userRepository.update(payload.sub, {
            lastActiveAt: new Date(),
          });
        }

        this.broadcastOrgPresence(payload.organizationId);
      }
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket) {
    const user = client.user;

    if (user?.organizationId) {
      this.presenceService.userDisconnected(user.organizationId, user.sub);
      this.broadcastOrgPresence(user.organizationId);
    }

    this.logger.debug(`Socket disconnected: ${client.id}`);
  }

  @SubscribeMessage('presence:ping')
  async handlePresencePing(@ConnectedSocket() client: AuthenticatedSocket) {
    const user = client.user;
    if (!user?.organizationId) return { ok: false };

    const now = Date.now();
    const lastTouch = this.lastActiveTouch.get(user.sub) ?? 0;

    if (now - lastTouch < PRESENCE_PING_THROTTLE_MS) {
      return { ok: true };
    }

    this.lastActiveTouch.set(user.sub, now);

    void this.userRepository.update(user.sub, {
      lastActiveAt: new Date(),
    });

    return { ok: true };
  }

  @SubscribeMessage('project:join')
  async handleProjectJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { projectId?: string },
  ) {
    if (!client.user || !body?.projectId) return;

    await client.join(this.projectRoom(body.projectId));
    return { joined: body.projectId };
  }

  @SubscribeMessage('project:leave')
  async handleProjectLeave(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() body: { projectId?: string },
  ) {
    if (!body?.projectId) return;

    await client.leave(this.projectRoom(body.projectId));
    return { left: body.projectId };
  }

  emitToUser<T>(userId: string, event: string, payload: T) {
    this.server.to(this.userRoom(userId)).emit(event, payload);
  }

  emitToProject<T>(projectId: string, event: string, payload: T) {
    this.server.to(this.projectRoom(projectId)).emit(event, payload);
  }

  emitToOrg<T>(organizationId: string, event: string, payload: T) {
    this.server.to(this.orgRoom(organizationId)).emit(event, payload);
  }

  broadcastOrgPresence(organizationId: string) {
    const snapshot = this.presenceService.getOrgPresence(organizationId);
    this.emitToOrg(organizationId, 'presence:updated', snapshot);
  }

  private userRoom(userId: string) {
    return `user:${userId}`;
  }

  private orgRoom(organizationId: string) {
    return `org:${organizationId}`;
  }

  private projectRoom(projectId: string) {
    return `project:${projectId}`;
  }

  private extractBearerToken(header?: string) {
    if (!header) return null;

    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null;

    return token;
  }
}
