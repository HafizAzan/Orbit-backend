import { generateSecret, generateURI, verify } from 'otplib';

export function generateTwoFactorSecret() {
  return generateSecret();
}

export function buildTwoFactorOtpAuthUrl(
  email: string,
  secret: string,
  issuer = 'Orbit',
) {
  return generateURI({
    issuer,
    label: email,
    secret,
  });
}

export async function verifyTwoFactorCode(secret: string, code: string) {
  const result = await verify({ secret, token: code });
  return result.valid;
}
