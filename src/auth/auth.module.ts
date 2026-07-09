import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailModule } from '../email/email.module';
import { Organization } from '../entities/organization.entity';
import { PasswordReset } from '../entities/password-reset.entity';
import { PendingEmailChange } from '../entities/pending-email-change.entity';
import { PendingRegistration } from '../entities/pending-registration.entity';
import { Subscription } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OrganizationBillingGuard } from './guards/organization-billing.guard';
import { PlatformAdminGuard } from './guards/platform-admin.guard';
import { JwtStrategy } from './jwt/jwt.strategy';
import { OrganizationGuardsModule } from './organization-guards.module';
import { RegisterRateLimitGuard } from './rate-limit/register-rate-limit.guard';
import { RegisterRateLimitService } from './rate-limit/register-rate-limit.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Organization,
      PendingRegistration,
      PasswordReset,
      Subscription,
      PendingEmailChange,
    ]),
    EmailModule,
    OrganizationGuardsModule,
    forwardRef(() => OrganizationsModule),
    forwardRef(() => NotificationsModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        const expiresIn = configService.get<string>(
          'JWT_EXPIRES_IN',
          '30m',
        ) as never;

        if (!secret) {
          throw new Error('JWT_SECRET is not configured.');
        }

        return {
          secret,
          signOptions: {
            expiresIn,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    OrganizationGuardsModule,
    OrganizationBillingGuard,
    PlatformAdminGuard,
    RegisterRateLimitService,
    RegisterRateLimitGuard,
  ],
  exports: [
    RegisterRateLimitService,
    RegisterRateLimitGuard,
    JwtModule,
    PassportModule,
    JwtAuthGuard,
    OrganizationGuardsModule,
    OrganizationBillingGuard,
    PlatformAdminGuard,
  ],
})
export class AuthModule {}
