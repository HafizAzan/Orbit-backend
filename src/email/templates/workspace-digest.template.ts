type DigestItem = {
  label: string;
  value: string;
};

type DigestEmailParams = {
  fullName: string;
  workspaceName: string;
  title: string;
  intro: string;
  items: DigestItem[];
  ctaLabel: string;
  ctaUrl: string;
};

function renderDigestItems(items: DigestItem[]) {
  return items
    .map(
      (item) => `
        <tr>
          <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:14px;">${item.label}</td>
          <td style="padding:12px 0;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;">${item.value}</td>
        </tr>
      `,
    )
    .join('');
}

export function buildWorkspaceDigestEmailHtml(params: DigestEmailParams) {
  return `
    <div style="font-family:Arial,sans-serif;background:#f8fafc;padding:32px 16px;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;">
        <p style="margin:0 0 8px;color:#64748b;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;">${params.workspaceName}</p>
        <h1 style="margin:0 0 12px;color:#0f172a;font-size:24px;">${params.title}</h1>
        <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">Hi ${params.fullName}, ${params.intro}</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          ${renderDigestItems(params.items)}
        </table>
        <a href="${params.ctaUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:600;">
          ${params.ctaLabel}
        </a>
      </div>
    </div>
  `;
}

export function buildDailyDigestEmailHtml(params: {
  fullName: string;
  workspaceName: string;
  tasksDueToday: number;
  openTasks: number;
  recentActivity: number;
  dashboardUrl: string;
}) {
  return buildWorkspaceDigestEmailHtml({
    fullName: params.fullName,
    workspaceName: params.workspaceName,
    title: 'Your daily workspace digest',
    intro: 'here is a quick summary of what needs attention today.',
    items: [
      { label: 'Tasks due today', value: String(params.tasksDueToday) },
      { label: 'Open tasks', value: String(params.openTasks) },
      { label: 'Activity in the last 24h', value: String(params.recentActivity) },
    ],
    ctaLabel: 'Open dashboard',
    ctaUrl: params.dashboardUrl,
  });
}

export function buildWeeklyReportEmailHtml(params: {
  fullName: string;
  workspaceName: string;
  completedTasks: number;
  createdTasks: number;
  activeMembers: number;
  reportsUrl: string;
}) {
  return buildWorkspaceDigestEmailHtml({
    fullName: params.fullName,
    workspaceName: params.workspaceName,
    title: 'Weekly workspace report',
    intro: 'here is how your organization performed this week.',
    items: [
      { label: 'Tasks completed', value: String(params.completedTasks) },
      { label: 'Tasks created', value: String(params.createdTasks) },
      { label: 'Active members', value: String(params.activeMembers) },
    ],
    ctaLabel: 'View reports',
    ctaUrl: params.reportsUrl,
  });
}
