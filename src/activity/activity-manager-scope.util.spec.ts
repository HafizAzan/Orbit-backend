import {
  ActivityModule,
  MANAGER_ACTIVITY_MODULES,
} from '../enum/activity.enum';

describe('manager activity scope', () => {
  it('limits manager-visible modules to tasks, projects, and teams', () => {
    expect(MANAGER_ACTIVITY_MODULES).toEqual([
      ActivityModule.TASKS,
      ActivityModule.PROJECTS,
      ActivityModule.TEAMS,
    ]);
  });

  it('excludes billing, security, organization, and members modules', () => {
    expect(MANAGER_ACTIVITY_MODULES).not.toContain(ActivityModule.BILLING);
    expect(MANAGER_ACTIVITY_MODULES).not.toContain(ActivityModule.SECURITY);
    expect(MANAGER_ACTIVITY_MODULES).not.toContain(ActivityModule.ORGANIZATION);
    expect(MANAGER_ACTIVITY_MODULES).not.toContain(ActivityModule.MEMBERS);
  });
});
