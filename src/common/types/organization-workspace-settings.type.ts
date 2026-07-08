export type OrganizationWorkspaceSettings = {
  dailyDigest: boolean;
  realtimePush: boolean;
  weeklyReport: boolean;
  twoFactorRequired: boolean;
  sessionTimeoutEnabled: boolean;
  sessionTimeoutMinutes: number;
};

export const DEFAULT_ORGANIZATION_WORKSPACE_SETTINGS: OrganizationWorkspaceSettings =
  {
    dailyDigest: true,
    realtimePush: false,
    weeklyReport: true,
    twoFactorRequired: true,
    sessionTimeoutEnabled: true,
    sessionTimeoutMinutes: 30,
  };

export function mergeOrganizationWorkspaceSettings(
  current: OrganizationWorkspaceSettings | null | undefined,
  patch: Partial<OrganizationWorkspaceSettings> = {},
): OrganizationWorkspaceSettings {
  const base = current ?? DEFAULT_ORGANIZATION_WORKSPACE_SETTINGS;

  return {
    dailyDigest: patch.dailyDigest ?? base.dailyDigest,
    realtimePush: patch.realtimePush ?? base.realtimePush,
    weeklyReport: patch.weeklyReport ?? base.weeklyReport,
    twoFactorRequired: patch.twoFactorRequired ?? base.twoFactorRequired,
    sessionTimeoutEnabled:
      patch.sessionTimeoutEnabled ?? base.sessionTimeoutEnabled,
    sessionTimeoutMinutes:
      patch.sessionTimeoutMinutes ?? base.sessionTimeoutMinutes,
  };
}
