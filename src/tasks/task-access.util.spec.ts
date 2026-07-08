import { RegisterAs } from '../enum/auth.enum';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import type { Task } from '../entities/task.entity';
import {
  canAccessTeamInsights,
  canMemberUpdateTaskStatus,
  canDeleteAnyTask,
  canModifyTask,
  canOperateOnTasks,
  getMemberTaskUpdateViolation,
} from './task-access.util';

function memberUser(userId = 'member-1'): JwtPayload {
  return {
    sub: userId,
    role: RegisterAs.MEMBER,
    organizationId: 'org-1',
    email: 'member@example.com',
  };
}

function assignedTask(assigneeId = 'member-1'): Task {
  return {
    assigneeId,
    createdById: 'manager-1',
  } as Task;
}

describe('member task access', () => {
  it('allows status-only updates for assigned tasks', () => {
    expect(
      getMemberTaskUpdateViolation({
        status: 'done' as never,
      }),
    ).toBeNull();
    expect(canMemberUpdateTaskStatus(memberUser(), assignedTask())).toBe(true);
  });

  it('rejects non-status updates for members', () => {
    expect(getMemberTaskUpdateViolation({ title: 'Renamed' })).toBe(
      'Members can only update task status.',
    );
    expect(getMemberTaskUpdateViolation({ priority: 'high' as never })).toBe(
      'Members can only update task status.',
    );
  });

  it('rejects status updates for unassigned tasks', () => {
    expect(
      canMemberUpdateTaskStatus(memberUser(), assignedTask('other-user')),
    ).toBe(false);
  });
});

describe('team insights access', () => {
  it('allows owner, admin, and manager only', () => {
    expect(canAccessTeamInsights(RegisterAs.OWNER)).toBe(true);
    expect(canAccessTeamInsights(RegisterAs.ADMIN)).toBe(true);
    expect(canAccessTeamInsights(RegisterAs.MANAGER)).toBe(true);
    expect(canAccessTeamInsights(RegisterAs.MEMBER)).toBe(false);
  });
});

describe('owner task access', () => {
  const ownerUser: JwtPayload = {
    sub: 'owner-1',
    role: RegisterAs.OWNER,
    organizationId: 'org-1',
    email: 'owner@example.com',
  };

  it('cannot operate on tasks', () => {
    expect(canOperateOnTasks(RegisterAs.OWNER)).toBe(false);
    expect(canDeleteAnyTask(ownerUser)).toBe(false);
    expect(canModifyTask(ownerUser, assignedTask())).toBe(false);
  });
});
