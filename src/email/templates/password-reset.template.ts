type PasswordResetEmailParams = {
  fullName: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export function buildPasswordResetEmailHtml({
  fullName,
  resetUrl,
  expiresInMinutes,
}: PasswordResetEmailParams) {
  const safeName = fullName.trim() || 'there';

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px; color: #4f46e5;">Reset your Orbit password</h2>
      <p>Hi ${safeName},</p>
      <p>We received a request to reset your password. Click the button below to choose a new password:</p>
      <p style="margin: 28px 0;">
        <a href="${resetUrl}" style="display: inline-block; background: #4f46e5; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600;">
          Reset password
        </a>
      </p>
      <p>This link expires in <strong>${expiresInMinutes} minutes</strong>.</p>
      <p style="color: #6b7280; font-size: 14px;">If you did not request a password reset, you can safely ignore this email.</p>
    </div>
  `.trim();
}
