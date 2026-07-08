import { RegisterAs } from '../enum/auth.enum';
import { ProjectMemberRole } from '../enum/project.enum';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import type { ProjectMember } from '../entities/project-member.entity';

export function hasOrgWideProjectAccess(role: RegisterAs) {
  return role === RegisterAs.OWNER || role === RegisterAs.ADMIN;
}

export function isOperationalProjectLeadRole(role: RegisterAs) {
  return role === RegisterAs.MANAGER || role === RegisterAs.ADMIN;
}

export function canAssignProjectLead(role: RegisterAs) {
  return hasOrgWideProjectAccess(role);
}

export function isProjectScopedWorkspaceRole(role: RegisterAs) {
  return role === RegisterAs.MANAGER || role === RegisterAs.MEMBER;
}

export function canCreateProject(role: RegisterAs) {
  return (
    role === RegisterAs.OWNER ||
    role === RegisterAs.ADMIN ||
    role === RegisterAs.MANAGER
  );
}

export function canManageProjectMembership(
  actor: JwtPayload,
  membership: ProjectMember | null,
) {
  if (hasOrgWideProjectAccess(actor.role)) {
    return true;
  }

  return membership?.role === ProjectMemberRole.ADMIN;
}

export function canMarkProjectComplete(role: RegisterAs) {
  return (
    role === RegisterAs.OWNER ||
    role === RegisterAs.ADMIN ||
    role === RegisterAs.MANAGER
  );
}

export function canEditProject(
  actor: JwtPayload,
  membership: ProjectMember | null,
) {
  if (actor.role === RegisterAs.MEMBER) {
    return false;
  }

  if (hasOrgWideProjectAccess(actor.role)) {
    return true;
  }

  if (actor.role === RegisterAs.MANAGER) {
    return (
      membership?.role === ProjectMemberRole.ADMIN ||
      membership?.role === ProjectMemberRole.MEMBER
    );
  }

  return false;
}

export function canDeleteProject(
  actor: JwtPayload,
  membership: ProjectMember | null,
  createdById: string,
) {
  if (hasOrgWideProjectAccess(actor.role)) {
    return true;
  }

  if (actor.role === RegisterAs.MANAGER) {
    return (
      membership?.role === ProjectMemberRole.ADMIN || createdById === actor.sub
    );
  }

  return false;
}
