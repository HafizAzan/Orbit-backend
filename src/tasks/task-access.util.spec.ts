import { RegisterAs } from '../enum/auth.enum';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import type { Task } from '../entities/task.entity';
import {
  canMemberUpdateTaskStatus,
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
