import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Subscription } from '../../entities/subscription.entity';
import { isOrganizationSubscriptionActive } from '../../billing/organization-subscription.util';
import { RegisterAs } from '../../enum/auth.enum';
import type { JwtPayload } from '../jwt/jwt-payload.type';

@Injectable()
export class OrganizationSubscriptionActiveGuard implements CanActivate {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as JwtPayload | undefined;

    if (!user?.organizationId) {
      return true;
    }

    if (
      await isOrganizationSubscriptionActive(
        this.subscriptionRepository,
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
