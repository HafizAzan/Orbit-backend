import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { JwtPayload } from '../jwt/jwt-payload.type';

@Injectable()
export class OrganizationMemberGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;

    if (!user) {
      throw new ForbiddenException('Authentication is required.');
    }

    if (!user.organizationId) {
      throw new ForbiddenException('Organization membership is required.');
    }

    return true;
  }
}
