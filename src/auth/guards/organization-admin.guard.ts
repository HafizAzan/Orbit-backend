import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { RegisterAs } from '../../enum/auth.enum';
import type { JwtPayload } from '../jwt/jwt-payload.type';

@Injectable()
export class OrganizationAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;

    if (!user) {
      throw new ForbiddenException('Authentication is required.');
    }

    if (!user.organizationId) {
      throw new ForbiddenException('Organization membership is required.');
    }

    if (user.role !== RegisterAs.OWNER && user.role !== RegisterAs.ADMIN) {
      throw new ForbiddenException(
        'Only organization owners or admins can perform this action.',
      );
    }

    return true;
  }
}
