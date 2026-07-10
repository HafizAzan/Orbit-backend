import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GitHubOAuthProfile = {
  id: string;
  login: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
  accessToken: string;
};

@Injectable()
export class GitHubOAuthService {
  constructor(private readonly configService: ConfigService) {}

  isConfigured() {
    return Boolean(
      this.configService.get<string>('GITHUB_CLIENT_ID') &&
        this.configService.get<string>('GITHUB_CLIENT_SECRET') &&
        this.configService.get<string>('GITHUB_CALLBACK_URL'),
    );
  }

  getAuthorizeUrl(state: string) {
    this.assertConfigured();
    const clientId = this.configService.get<string>('GITHUB_CLIENT_ID')!;
    const callbackUrl = this.configService.get<string>('GITHUB_CALLBACK_URL')!;
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: callbackUrl,
      scope: 'read:user user:email',
      state,
      allow_signup: 'true',
    });
    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<GitHubOAuthProfile> {
    this.assertConfigured();
    const clientId = this.configService.get<string>('GITHUB_CLIENT_ID')!;
    const clientSecret = this.configService.get<string>('GITHUB_CLIENT_SECRET')!;
    const callbackUrl = this.configService.get<string>('GITHUB_CALLBACK_URL')!;

    const tokenResponse = await fetch(
      'https://github.com/login/oauth/access_token',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: callbackUrl,
        }),
      },
    );

    if (!tokenResponse.ok) {
      throw new BadRequestException('GitHub authorization failed.');
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
          'GitHub authorization failed.',
      );
    }

    const accessToken = tokenPayload.access_token;
    const [userResponse, emailsResponse] = await Promise.all([
      fetch('https://api.github.com/user', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'Orbit',
        },
      }),
      fetch('https://api.github.com/user/emails', {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${accessToken}`,
          'User-Agent': 'Orbit',
        },
      }),
    ]);

    if (!userResponse.ok) {
      throw new BadRequestException('Unable to load GitHub profile.');
    }

    const profile = (await userResponse.json()) as {
      id: number;
      login: string;
      name: string | null;
      email: string | null;
      avatar_url: string | null;
    };

    let email = profile.email?.trim().toLowerCase() ?? null;
    if (!email && emailsResponse.ok) {
      const emails = (await emailsResponse.json()) as Array<{
        email: string;
        primary: boolean;
        verified: boolean;
      }>;
      const preferred =
        emails.find((item) => item.primary && item.verified) ??
        emails.find((item) => item.verified) ??
        emails[0];
      email = preferred?.email?.trim().toLowerCase() ?? null;
    }

    if (!email) {
      throw new BadRequestException(
        'GitHub account must have a verified email address.',
      );
    }

    return {
      id: String(profile.id),
      login: profile.login,
      name: profile.name,
      email,
      avatarUrl: profile.avatar_url,
      accessToken,
    };
  }

  private assertConfigured() {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException(
        'GitHub OAuth is not configured. Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_CALLBACK_URL.',
      );
    }
  }
}
