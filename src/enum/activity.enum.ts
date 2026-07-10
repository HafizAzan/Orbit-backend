export enum ActivityModule {
  TASKS = 'tasks',
  PROJECTS = 'projects',
  TEAMS = 'teams',
  MEMBERS = 'members',
  ORGANIZATION = 'organization',
  SECURITY = 'security',
  BILLING = 'billing',
  GITHUB = 'github',
}

export enum ActivityAction {
  CREATED = 'created',
  UPDATED = 'updated',
  DELETED = 'deleted',
  ASSIGNED = 'assigned',
  STATUS_CHANGED = 'status_changed',
  INVITED = 'invited',
  REMOVED = 'removed',
  ROLE_CHANGED = 'role_changed',
  EMAIL_CHANGED = 'email_changed',
  REQUESTED = 'requested',
  PUSHED = 'pushed',
  OPENED = 'opened',
  MERGED = 'merged',
  CLOSED = 'closed',
  CHECK_COMPLETED = 'check_completed',
}

export const MANAGER_ACTIVITY_MODULES: ActivityModule[] = [
  ActivityModule.TASKS,
  ActivityModule.PROJECTS,
  ActivityModule.TEAMS,
  ActivityModule.GITHUB,
];
