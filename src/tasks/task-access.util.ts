import { RegisterAs } from '../enum/auth.enum';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import type { Task } from '../entities/task.entity';
import { hasOrgWideProjectAccess } from '../projects/project-access.util';
import type { UpdateTaskDto } from './dto/task.dto';

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

export function canMemberUpdateTaskStatus(user: JwtPayload, task: Task) {
  return user.role === RegisterAs.MEMBER && task.assigneeId === user.sub;
}

export function getMemberTaskUpdateViolation(
  dto: UpdateTaskDto,
): string | null {
  if (
    dto.title !== undefined ||
    dto.description !== undefined ||
    dto.priority !== undefined ||
    dto.dueDate !== undefined ||
    dto.assigneeId !== undefined ||
    dto.estimatedHours !== undefined ||
    dto.labels !== undefined
  ) {
    return 'Members can only update task status.';
  }

  if (dto.status === undefined) {
    return 'Members can only update task status.';
  }

  return null;
}
