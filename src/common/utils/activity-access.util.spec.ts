import { RegisterAs } from '../../enum/auth.enum';
import { ActivityEvent } from '../../entities/activity-event.entity';
import type { JwtPayload } from '../../auth/jwt/jwt-payload.type';
import { canDeleteActivity } from './activity-access.util';

function actor(role: RegisterAs, sub = 'actor-1'): JwtPayload {
  return {
    sub,
    email: 'actor@example.com',
    role,
    organizationId: 'org-1',
  };
}

function event(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    organizationId: 'org-1',
    actorRole: RegisterAs.MEMBER,
    ...overrides,
  } as ActivityEvent;
}

describe('canDeleteActivity', () => {
  it('allows owner to delete activity in their organization', () => {
    expect(canDeleteActivity(actor(RegisterAs.OWNER), event())).toBe(true);
  });

  it('allows admin to delete manager and member activity', () => {
    expect(
      canDeleteActivity(actor(RegisterAs.ADMIN), event({ actorRole: RegisterAs.MANAGER })),
    ).toBe(true);
    expect(
      canDeleteActivity(actor(RegisterAs.ADMIN), event({ actorRole: RegisterAs.MEMBER })),
    ).toBe(true);
  });

  it('denies admin from deleting owner activity', () => {
    expect(
      canDeleteActivity(actor(RegisterAs.ADMIN), event({ actorRole: RegisterAs.OWNER })),
    ).toBe(false);
  });

  describe('manager role', () => {
    it('cannot delete any activity entries', () => {
      expect(
        canDeleteActivity(
          actor(RegisterAs.MANAGER, 'manager-1'),
          event({ actorRole: RegisterAs.MEMBER, actorId: 'member-1' }),
        ),
      ).toBe(false);
    });

    it('cannot delete activity from another organization', () => {
      expect(
        canDeleteActivity(
          actor(RegisterAs.MANAGER),
          event({ organizationId: 'other-org', actorRole: RegisterAs.MEMBER }),
        ),
      ).toBe(false);
    });
  });

  it('denies members from deleting activity', () => {
    expect(canDeleteActivity(actor(RegisterAs.MEMBER), event())).toBe(false);
  });
});
