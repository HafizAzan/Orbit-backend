import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../entities/organization.entity';
import { PasswordReset } from '../entities/password-reset.entity';
import { PendingEmailChange } from '../entities/pending-email-change.entity';
import { PendingRegistration } from '../entities/pending-registration.entity';
import { Subscription } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';
import { EmailModule } from '../email/email.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { OrganizationBillingGuard } from './guards/organization-billing.guard';
import { PlatformAdminGuard } from './guards/platform-admin.guard';
import { RegisterRateLimitGuard } from './rate-limit/register-rate-limit.guard';
import { RegisterRateLimitService } from './rate-limit/register-rate-limit.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Organization, PendingRegistration, PasswordReset, Subscription, PendingEmailChange]),
    EmailModule,
    forwardRef(() => OrganizationsModule),
    forwardRef(() => NotificationsModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error('JWT_SECRET is not configured.');
        }

        return {
          secret,
          signOptions: {
            expiresIn: configService.get<string>('JWT_EXPIRES_IN', '7d') as never,
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
    OrganizationBillingGuard,
    PlatformAdminGuard,
  ],
})
export class AuthModule {}
