import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { DataSource } from 'typeorm';
import { Subscription } from '../../entities/subscription.entity';
import { isOrganizationSubscriptionActive } from '../../billing/organization-subscription.util';
import { RegisterAs } from '../../enum/auth.enum';
import type { JwtPayload } from '../jwt/jwt-payload.type';

@Injectable()
export class OrganizationSubscriptionActiveGuard implements CanActivate {
  constructor(private readonly dataSource: DataSource) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;

    if (!user?.organizationId) {
      return true;
    }

    const subscriptionRepository = this.dataSource.getRepository(Subscription);

    if (
      await isOrganizationSubscriptionActive(
        subscriptionRepository,
        user.organizationId,
      )
    ) {
      return true;
    }

    if (user.role === RegisterAs.OWNER || user.role === RegisterAs.ADMIN) {
      throw new ForbiddenException(
        'Select a subscription plan to activate your workspace.',
      );
    }

    throw new ForbiddenException(
      'Your organization is activating its subscription. Please check back soon.',
    );
  }
}
