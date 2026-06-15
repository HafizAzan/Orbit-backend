import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Organization } from '../entities/organization.entity';
import { PendingRegistration } from '../entities/pending-registration.entity';
import { User } from '../entities/user.entity';
import { EmailModule } from '../email/email.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt/jwt.strategy';
import { RegisterRateLimitGuard } from './rate-limit/register-rate-limit.guard';
import { RegisterRateLimitService } from './rate-limit/register-rate-limit.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Organization, PendingRegistration]),
    EmailModule,
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
    RegisterRateLimitService,
    RegisterRateLimitGuard,
  ],
  exports: [RegisterRateLimitService, RegisterRateLimitGuard, JwtModule],
})
export class AuthModule {}
