import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { Organization } from '../../entities/organization.entity';
import { User } from '../../entities/user.entity';
import { DEFAULT_ORGANIZATION_WORKSPACE_SETTINGS } from '../../common/types/organization-workspace-settings.type';
import type { JwtPayload } from './jwt-payload.type';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
  ) {
    const secret = configService.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error('JWT_SECRET is not configured.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid access token.');
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid access token.');
    }

    if (user.organizationId && !user.isPlatformAdmin) {
      const organization = await this.organizationRepository.findOne({
        where: { id: user.organizationId },
      });
      const settings =
        organization?.workspaceSettings ??
        DEFAULT_ORGANIZATION_WORKSPACE_SETTINGS;

      if (settings.sessionTimeoutEnabled && user.lastActiveAt) {
        const idleMs = Date.now() - user.lastActiveAt.getTime();
        const timeoutMs = settings.sessionTimeoutMinutes * 60 * 1000;

        if (idleMs > timeoutMs) {
          throw new UnauthorizedException(
            'Session expired due to inactivity. Please sign in again.',
          );
        }
      }
    }

    if (
      !user.lastActiveAt ||
      Date.now() - user.lastActiveAt.getTime() > 60_000
    ) {
      await this.userRepository.update(user.id, { lastActiveAt: new Date() });
    }

    return payload;
  }
}
