import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GoogleOAuthProfile = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  accessToken: string;
};

@Injectable()
export class GoogleOAuthService {
  constructor(private readonly configService: ConfigService) {}

  isConfigured() {
    return Boolean(
      this.configService.get<string>('GOOGLE_CLIENT_ID') &&
        this.configService.get<string>('GOOGLE_CLIENT_SECRET') &&
        this.configService.get<string>('GOOGLE_CALLBACK_URL'),
    );
  }

  getAuthorizeUrl(state: string) {
    this.assertConfigured();
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID')!;
    const callbackUrl = this.configService.get<string>('GOOGLE_CALLBACK_URL')!;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<GoogleOAuthProfile> {
    this.assertConfigured();
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID')!;
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET')!;
    const callbackUrl = this.configService.get<string>('GOOGLE_CALLBACK_URL')!;

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: callbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenResponse.ok) {
      throw new BadRequestException('Google authorization failed.');
    }

    const tokenPayload = (await tokenResponse.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (!tokenPayload.access_token) {
      throw new BadRequestException(
        tokenPayload.error_description ??
          tokenPayload.error ??
          'Google authorization failed.',
      );
    }

    const accessToken = tokenPayload.access_token;
    const userResponse = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    if (!userResponse.ok) {
      throw new BadRequestException('Unable to load Google profile.');
    }

    const profile = (await userResponse.json()) as {
      sub: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    const email = profile.email?.trim().toLowerCase() ?? null;
    if (!email || profile.email_verified === false) {
      throw new BadRequestException(
        'Google account must have a verified email address.',
      );
    }

    return {
      id: profile.sub,
      email,
      name: profile.name ?? null,
      avatarUrl: profile.picture ?? null,
      accessToken,
    };
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'Google OAuth is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_CALLBACK_URL.',
      );
    }
  }
}
