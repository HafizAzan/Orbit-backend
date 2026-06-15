import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { VerifyRegisterDto } from '../dto/verify-register.dto';
import { Organization } from '../entities/organization.entity';
import { PendingRegistration } from '../entities/pending-registration.entity';
import { User } from '../entities/user.entity';
import {
  AccountStatus,
  AuthProvider,
  EmailVerificationStatus,
  RegisterAs,
  SignupSource,
} from '../enum/auth.enum';
import { RegisterRateLimitService } from './rate-limit/register-rate-limit.service';
import type { JwtPayload } from './jwt/jwt-payload.type';
import { EmailService } from '../email/email.service';

const OTP_TTL_MS = 10 * 60 * 1000;

export type AuthUserResponse = {
  id: string;
  name: string;
  email: string;
  role: RegisterAs;
  isPlatformAdmin: boolean;
  emailVerificationStatus: EmailVerificationStatus;
  accountStatus: AccountStatus;
  organization: {
    id: string;
    name: string;
  } | null;
};

export type AuthSessionResponse = {
  message: string;
  accessToken: string;
  user: AuthUserResponse;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly registerRateLimitService: RegisterRateLimitService,
    private readonly emailService: EmailService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(PendingRegistration)
    private readonly pendingRegistrationRepository: Repository<PendingRegistration>,
  ) {}

  async sendRegisterOtp(dto: RegisterDto, ip: string) {
    const email = dto.email.trim().toLowerCase();
    const organizationSlug = dto.organizationSlug.trim().toLowerCase();

    if (dto.signupSource === SignupSource.INVITE) {
      throw new BadRequestException('Invite signup is not implemented yet.');
    }

    if (dto.kindOfUser === RegisterAs.SUPER_ADMIN) {
      throw new BadRequestException('Invalid registration type.');
    }

    if (dto.authProvider !== AuthProvider.EMAIL) {
      throw new BadRequestException(
        'Only email registration is supported right now.',
      );
    }

    const existingUser = await this.userRepository.findOne({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists.');
    }

    const existingOrg = await this.organizationRepository.findOne({
      where: { slug: organizationSlug },
    });

    if (existingOrg) {
      throw new ConflictException('This organization slug is already taken.');
    }

    const otp = this.generateOtpCode();
    const otpHash = await argon2.hash(otp);
    const passwordHash = await argon2.hash(dto.password);

    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.pendingRegistrationRepository.upsert(
      {
        email,
        fullName: dto.fullName.trim(),
        organizationName: dto.organizationName.trim(),
        organizationSlug,
        passwordHash,
        authProvider: dto.authProvider,
        signupSource: dto.signupSource,
        role: RegisterAs.OWNER,
        otpHash,
        expiresAt,
      },
      ['email'],
    );

    await this.emailService.sendRegisterOtpEmail({
      to: email,
      fullName: dto.fullName.trim(),
      otp,
    });

    this.registerRateLimitService.recordAttempt(ip);

    const isDev = this.configService.get<string>('NODE_ENV') !== 'production';

    return {
      message: `Verification code sent to ${email}`,
      email,
      expiresAt: expiresAt.toISOString(),
      ...(isDev ? { devOtp: otp } : {}),
    };
  }

  async getRegisterPending(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const pending = await this.pendingRegistrationRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (!pending) {
      throw new NotFoundException(
        'Registration not found. Please sign up again.',
      );
    }

    const isExpired = pending.expiresAt.getTime() < Date.now();

    if (isExpired) {
      await this.pendingRegistrationRepository.delete({ email: normalizedEmail });
      throw new BadRequestException('Verification code has expired.');
    }

    return {
      email: pending.email,
      expiresAt: pending.expiresAt.toISOString(),
      isExpired: false,
    };
  }

  async resendRegisterOtp(email: string) {
    const normalizedEmail = email.trim().toLowerCase();

    const pending = await this.pendingRegistrationRepository.findOne({
      where: { email: normalizedEmail },
    });

    if (!pending) {
      throw new NotFoundException(
        'Registration not found. Please sign up again.',
      );
    }

    const otp = this.generateOtpCode();
    const otpHash = await argon2.hash(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.pendingRegistrationRepository.update(
      { email: normalizedEmail },
      { otpHash, expiresAt },
    );

    await this.emailService.sendRegisterOtpEmail({
      to: normalizedEmail,
      fullName: pending.fullName,
      otp,
    });

    const isDev = this.configService.get<string>('NODE_ENV') !== 'production';

    return {
      message: `A new verification code was sent to ${normalizedEmail}`,
      email: normalizedEmail,
      expiresAt: expiresAt.toISOString(),
      ...(isDev ? { devOtp: otp } : {}),
    };
  }

  async verifyRegister(dto: VerifyRegisterDto): Promise<AuthSessionResponse> {
    const email = dto.email.trim().toLowerCase();

    const pending = await this.pendingRegistrationRepository.findOne({
      where: { email },
    });

    if (!pending) {
      throw new NotFoundException(
        'Registration not found. Please sign up again.',
      );
    }

    if (pending.expiresAt.getTime() < Date.now()) {
      await this.pendingRegistrationRepository.delete({ email });
      throw new BadRequestException('Verification code has expired.');
    }

    const isOtpValid = await argon2.verify(pending.otpHash, dto.otp);
    if (!isOtpValid) {
      throw new BadRequestException('Invalid verification code.');
    }

    const existingUser = await this.userRepository.findOne({
      where: { email },
    });
    if (existingUser) {
      await this.pendingRegistrationRepository.delete({ email });
      throw new ConflictException('An account with this email already exists.');
    }

    const organization = await this.organizationRepository.save(
      this.organizationRepository.create({
        name: pending.organizationName,
        slug: pending.organizationSlug,
      }),
    );

    const user = await this.userRepository.save(
      this.userRepository.create({
        fullName: pending.fullName,
        email: pending.email,
        passwordHash: pending.passwordHash,
        authProvider: pending.authProvider,
        signupSource: pending.signupSource,
        role: pending.role,
        emailVerificationStatus: EmailVerificationStatus.VERIFIED,
        accountStatus: AccountStatus.ACTIVE,
        isPlatformAdmin: false,
        organizationId: organization.id,
      }),
    );

    await this.pendingRegistrationRepository.delete({ email });

    return {
      message: `${organization.name} created successfully. You are now the organization owner.`,
      accessToken: this.signAccessToken(user),
      user: this.toAuthUserResponse(user, organization),
    };
  }

  async login(dto: LoginDto): Promise<AuthSessionResponse> {
    const email = dto.email.trim().toLowerCase();

    const user = await this.userRepository.findOne({
      where: { email },
      relations: { organization: true },
    });

    if (!user) {
      return this.handleLoginWithoutUser(email, dto.password);
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (user.accountStatus === AccountStatus.SUSPENDED) {
      throw new UnauthorizedException('Your account has been suspended.');
    }

    if (user.accountStatus === AccountStatus.PENDING) {
      throw new UnauthorizedException('Your account is not active yet.');
    }

    if (user.emailVerificationStatus !== EmailVerificationStatus.VERIFIED) {
      throw new UnauthorizedException(
        'Please verify your email before signing in.',
      );
    }

    return {
      message: `Welcome back, ${user.fullName}.`,
      accessToken: this.signAccessToken(user),
      user: this.toAuthUserResponse(user, user.organization),
    };
  }

  async getMe(userId: string): Promise<AuthUserResponse> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    return this.toAuthUserResponse(user, user.organization);
  }

  private async handleLoginWithoutUser(
    email: string,
    password: string,
  ): Promise<never> {
    const pending = await this.pendingRegistrationRepository.findOne({
      where: { email },
    });

    if (!pending) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const isPasswordValid = await argon2.verify(
      pending.passwordHash,
      password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    if (pending.expiresAt.getTime() < Date.now()) {
      await this.pendingRegistrationRepository.delete({ email });
      throw new BadRequestException(
        'Your verification code has expired. Please sign up again.',
      );
    }

    throw new HttpException(
      {
        statusCode: HttpStatus.FORBIDDEN,
        message: 'Please verify your email to complete registration.',
        code: 'PENDING_EMAIL_VERIFICATION',
        email,
        expiresAt: pending.expiresAt.toISOString(),
      },
      HttpStatus.FORBIDDEN,
    );
  }

  private signAccessToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      isPlatformAdmin: user.isPlatformAdmin,
      organizationId: user.organizationId,
    };

    return this.jwtService.sign(payload);
  }

  private generateOtpCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private toAuthUserResponse(
    user: User,
    organization: Organization | null,
  ): AuthUserResponse {
    return {
      id: user.id,
      name: user.fullName,
      email: user.email,
      role: user.role,
      isPlatformAdmin: user.isPlatformAdmin,
      emailVerificationStatus: user.emailVerificationStatus,
      accountStatus: user.accountStatus,
      organization: organization
        ? {
            id: organization.id,
            name: organization.name,
          }
        : null,
    };
  }
}
