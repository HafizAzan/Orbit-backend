import { Injectable } from '@nestjs/common';

export type OrgPresenceSnapshot = {
  onlineUserIds: string[];
};

@Injectable()
export class PresenceService {
  private readonly orgConnections = new Map<string, Map<string, number>>();

  userConnected(organizationId: string, userId: string) {
    const orgMap = this.orgConnections.get(organizationId) ?? new Map<string, number>();
    orgMap.set(userId, (orgMap.get(userId) ?? 0) + 1);
    this.orgConnections.set(organizationId, orgMap);
  }

  userDisconnected(organizationId: string, userId: string) {
    const orgMap = this.orgConnections.get(organizationId);
    if (!orgMap) return;

    const nextCount = (orgMap.get(userId) ?? 0) - 1;

    if (nextCount <= 0) {
      orgMap.delete(userId);
    } else {
      orgMap.set(userId, nextCount);
    }

    if (orgMap.size === 0) {
      this.orgConnections.delete(organizationId);
    }
  }

  getOrgPresence(organizationId: string): OrgPresenceSnapshot {
    const orgMap = this.orgConnections.get(organizationId);
    return {
      onlineUserIds: orgMap ? Array.from(orgMap.keys()) : [],
    };
  }

  isUserOnline(organizationId: string, userId: string) {
    return this.orgConnections.get(organizationId)?.has(userId) ?? false;
  }
}
