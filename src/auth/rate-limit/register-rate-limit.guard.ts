import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { getClientIp } from '../../common/utils/get-client-ip.util';
import { RegisterRateLimitService } from './register-rate-limit.service';

@Injectable()
export class RegisterRateLimitGuard implements CanActivate {
  constructor(
    private readonly registerRateLimitService: RegisterRateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const ip = getClientIp(request);
    const result = this.registerRateLimitService.check(ip);

    if (!result.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message:
            'Too many registration attempts from this IP. Try again after 12 hours.',
          retryAfter: result.retryAfter?.toISOString(),
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }
}
