import { RegisterAs } from '../enum/auth.enum';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import type { Task } from '../entities/task.entity';
import { hasOrgWideProjectAccess } from '../projects/project-access.util';

export function canViewAllOrganizationTasks(role: RegisterAs) {
  return (
    role === RegisterAs.OWNER ||
    role === RegisterAs.ADMIN ||
    role === RegisterAs.MANAGER
  );
}

export function canDeleteAnyTask(user: JwtPayload) {
  return canViewAllOrganizationTasks(user.role);
}

export function canModifyTask(user: JwtPayload, task: Task) {
  if (hasOrgWideProjectAccess(user.role)) {
    return true;
  }

  if (canViewAllOrganizationTasks(user.role)) {
    return true;
  }

  return task.assigneeId === user.sub || task.createdById === user.sub;
}
