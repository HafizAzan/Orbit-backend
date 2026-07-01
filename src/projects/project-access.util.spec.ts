import { RegisterAs } from '../enum/auth.enum';
import { ProjectMemberRole } from '../enum/project.enum';
import type { JwtPayload } from '../auth/jwt/jwt-payload.type';
import type { ProjectMember } from '../entities/project-member.entity';
import { canDeleteProject } from './project-access.util';

function actor(role: RegisterAs, sub = 'user-1'): JwtPayload {
  return {
    sub,
    email: 'user@example.com',
    role,
    organizationId: 'org-1',
  };
}

function membership(role: ProjectMemberRole): ProjectMember {
  return { role } as ProjectMember;
}

describe('canDeleteProject', () => {
  const createdById = 'creator-1';

  it('allows owner to delete any project', () => {
    expect(canDeleteProject(actor(RegisterAs.OWNER), null, createdById)).toBe(true);
    expect(canDeleteProject(actor(RegisterAs.OWNER), membership(ProjectMemberRole.MEMBER), createdById)).toBe(
      true,
    );
  });

  it('allows admin to delete any project', () => {
    expect(canDeleteProject(actor(RegisterAs.ADMIN), null, createdById)).toBe(true);
  });

  describe('manager role', () => {
    it('allows delete when manager is project admin', () => {
      expect(
        canDeleteProject(
          actor(RegisterAs.MANAGER, 'manager-1'),
          membership(ProjectMemberRole.ADMIN),
          createdById,
        ),
      ).toBe(true);
    });

    it('allows delete when manager created the project', () => {
      expect(
        canDeleteProject(
          actor(RegisterAs.MANAGER, 'manager-1'),
          membership(ProjectMemberRole.MEMBER),
          'manager-1',
        ),
      ).toBe(true);
    });

    it('denies delete when manager is only a project member', () => {
      expect(
        canDeleteProject(
          actor(RegisterAs.MANAGER, 'manager-2'),
          membership(ProjectMemberRole.MEMBER),
          createdById,
        ),
      ).toBe(false);
    });

    it('denies delete when manager has no project membership', () => {
      expect(canDeleteProject(actor(RegisterAs.MANAGER, 'manager-2'), null, createdById)).toBe(false);
    });
  });

  it('denies delete for members', () => {
    expect(
      canDeleteProject(
        actor(RegisterAs.MEMBER, 'member-1'),
        membership(ProjectMemberRole.ADMIN),
        'member-1',
      ),
    ).toBe(false);
  });
});
