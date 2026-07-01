import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  emitToUser<T>(userId: string, event: string, payload: T) {
    this.gateway.emitToUser(userId, event, payload);
  }

  emitToProject<T>(projectId: string, event: string, payload: T) {
    this.gateway.emitToProject(projectId, event, payload);
  }

  emitToOrg<T>(organizationId: string, event: string, payload: T) {
    this.gateway.emitToOrg(organizationId, event, payload);
  }

  broadcastOrgPresence(organizationId: string) {
    this.gateway.broadcastOrgPresence(organizationId);
  }
}
