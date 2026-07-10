type RegisterOtpEmailParams = {
  fullName: string;
  otp: string;
  expiresInMinutes: number;
};

export function buildRegisterOtpEmailHtml({
  fullName,
  otp,
  expiresInMinutes,
}: RegisterOtpEmailParams) {
  const safeName = fullName.trim() || 'there';

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #111827; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="margin: 0 0 16px; color: #4f46e5;">Verify your Orbit account</h2>
      <p>Hi ${safeName},</p>
      <p>Use the verification code below to complete your registration:</p>
      <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; margin: 24px 0; color: #4f46e5;">${otp}</p>
      <p>This code expires in <strong>${expiresInMinutes} minutes</strong>.</p>
      <p style="color: #6b7280; font-size: 14px;">If you did not request this code, you can safely ignore this email.</p>
    </div>
  `.trim();
}
