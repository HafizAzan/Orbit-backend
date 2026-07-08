import { ActivityEvent } from '../../entities/activity-event.entity';
import { RegisterAs } from '../../enum/auth.enum';
import type { JwtPayload } from '../../auth/jwt/jwt-payload.type';

export function canDeleteActivity(actor: JwtPayload, event: ActivityEvent) {
  if (actor.organizationId !== event.organizationId) {
    return false;
  }

  if (actor.role === RegisterAs.OWNER) {
    return true;
  }

  if (actor.role === RegisterAs.ADMIN) {
    return (
      event.actorRole === RegisterAs.ADMIN ||
      event.actorRole === RegisterAs.MANAGER ||
      event.actorRole === RegisterAs.MEMBER
    );
  }

  return false;
}
