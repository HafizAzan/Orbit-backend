import { RegisterAs } from '../../enum/auth.enum';

export function canChangeOwnEmail(role: RegisterAs) {
  return role === RegisterAs.OWNER;
}

export function canRequestOwnEmailChange(role: RegisterAs) {
  return (
    role === RegisterAs.ADMIN ||
    role === RegisterAs.MANAGER ||
    role === RegisterAs.MEMBER
  );
}

export function getEmailChangeRequestRecipientRoles(actorRole: RegisterAs): RegisterAs[] {
  if (actorRole === RegisterAs.ADMIN) {
    return [RegisterAs.OWNER];
  }

  if (actorRole === RegisterAs.MANAGER || actorRole === RegisterAs.MEMBER) {
    return [RegisterAs.ADMIN];
  }

  return [];
}

export function canActorChangeMemberEmail(
  actorRole: RegisterAs,
  targetRole: RegisterAs,
) {
  if (actorRole === RegisterAs.OWNER) {
    return (
      targetRole === RegisterAs.ADMIN ||
      targetRole === RegisterAs.MANAGER ||
      targetRole === RegisterAs.MEMBER
    );
  }

  if (actorRole === RegisterAs.ADMIN) {
    return (
      targetRole === RegisterAs.MANAGER || targetRole === RegisterAs.MEMBER
    );
  }

  return false;
}
