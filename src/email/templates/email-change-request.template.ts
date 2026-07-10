type EmailChangeRequestEmailParams = {
  recipientName: string;
  requesterName: string;
  requesterRoleLabel: string;
  organizationName: string;
  subject: string;
  currentEmail: string;
  newEmail: string;
  reason: string;
  settingsUrl: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildEmailChangeRequestEmailHtml({
  recipientName,
  requesterName,
  requesterRoleLabel,
  organizationName,
  subject,
  currentEmail,
  newEmail,
  reason,
  settingsUrl,
}: EmailChangeRequestEmailParams) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;">
      <h2 style="margin:0 0 12px;">Email change request</h2>
      <p>Hi ${escapeHtml(recipientName)},</p>
      <p><strong>${escapeHtml(requesterName)}</strong> (${escapeHtml(requesterRoleLabel)}) has requested an email update for their Orbit account in <strong>${escapeHtml(organizationName)}</strong>.</p>
      <p style="margin:16px 0;padding:16px;background:#f8fafc;border-radius:12px;color:#475569;">
        <strong>Subject:</strong> ${escapeHtml(subject)}<br />
        <strong>Current email:</strong> ${escapeHtml(currentEmail)}<br />
        <strong>Requested email:</strong> ${escapeHtml(newEmail)}
      </p>
      <p style="margin:16px 0;padding:16px;background:#eef2ff;border-radius:12px;color:#334155;">
        <strong>Reason:</strong><br />
        ${escapeHtml(reason).replace(/\n/g, '<br />')}
      </p>
      <p style="margin:24px 0;">
        <a href="${settingsUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">
          Review in workspace settings
        </a>
      </p>
      <p style="color:#64748b;font-size:14px;">Only selected recipients received this message. Update the member email from workspace settings if you approve this request.</p>
    </div>
  `;
}
