type TeamInviteEmailParams = {
  fullName: string;
  organizationName: string;
  inviterName: string;
  roleLabel: string;
  inviteUrl: string;
  message?: string;
  expiresInDays: number;
};

export function buildTeamInviteEmailHtml({
  fullName,
  organizationName,
  inviterName,
  roleLabel,
  inviteUrl,
  message,
  expiresInDays,
}: TeamInviteEmailParams) {
  const personalNote = message
    ? `<p style="margin:16px 0;padding:16px;background:#f8fafc;border-radius:12px;color:#475569;">${message}</p>`
    : '';

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a;max-width:560px;margin:0 auto;">
      <h2 style="margin:0 0 12px;">You're invited to join ${organizationName}</h2>
      <p>Hi ${fullName},</p>
      <p><strong>${inviterName}</strong> invited you to join <strong>${organizationName}</strong> on FlowSync as a <strong>${roleLabel}</strong>.</p>
      ${personalNote}
      <p style="margin:24px 0;">
        <a href="${inviteUrl}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;">
          Accept Invitation
        </a>
      </p>
      <p style="color:#64748b;font-size:14px;">This invite link expires in ${expiresInDays} days. If you did not expect this email, you can ignore it.</p>
    </div>
  `;
}
