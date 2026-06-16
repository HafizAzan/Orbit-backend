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
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { VerifyRegisterDto } from '../dto/verify-register.dto';
import { Organization } from '../entities/organization.entity';
import { PasswordReset } from '../entities/password-reset.entity';
import { PendingRegistration } from '../entities/pending-registration.entity';
import { Subscription } from '../entities/subscription.entity';
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
import { OrganizationStatus } from '../enum/billing.enum';
import { OrganizationsService } from '../organizations/organizations.service';

const OTP_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const JWT_REMEMBER_EXPIRES_IN = '15d';
const JWT_SESSION_EXPIRES_IN = '8h';
const FORGOT_PASSWORD_MESSAGE =
  'If an account exists for this email, a password reset link has been sent.';

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
  requiresPlanSelection: boolean;
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
    private readonly organizationsService: OrganizationsService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
    @InjectRepository(PendingRegistration)
    private readonly pendingRegistrationRepository: Repository<PendingRegistration>,
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    @InjectRepository(PasswordReset)
    private readonly passwordResetRepository: Repository<PasswordReset>,
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

    return {
      message: `Verification code sent to ${email}`,
      email,
      expiresAt: expiresAt.toISOString(),
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

    return {
      message: `A new verification code was sent to ${normalizedEmail}`,
      email: normalizedEmail,
      expiresAt: expiresAt.toISOString(),
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
        status: OrganizationStatus.TRIAL,
        billingEmail: pending.email,
        projectCount: 0,
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
      accessToken: this.signAccessToken(user, false),
      user: await this.toAuthUserResponse(user, organization),
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

    const remember = dto.remember === true;

    return {
      message: `Welcome back, ${user.fullName}.`,
      accessToken: this.signAccessToken(user, remember),
      user: await this.toAuthUserResponse(user, user.organization),
    };
  }

  async logout() {
    return {
      message: 'Logged out successfully.',
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const email = dto.email.trim().toLowerCase();
    const user = await this.userRepository.findOne({ where: { email } });

    if (!user?.passwordHash) {
      return { message: FORGOT_PASSWORD_MESSAGE, email };
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);

    await this.passwordResetRepository.delete({ email });
    await this.passwordResetRepository.save(
      this.passwordResetRepository.create({
        email,
        tokenHash,
        expiresAt,
      }),
    );

    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const resetUrl = `${frontendUrl}/reset-password?token=${rawToken}`;

    await this.emailService.sendPasswordResetEmail({
      to: email,
      fullName: user.fullName,
      resetUrl,
    });

    return {
      message: FORGOT_PASSWORD_MESSAGE,
      email,
    };
  }

  async validateResetToken(token: string) {
    const reset = await this.findValidPasswordReset(token);

    return {
      email: reset.email,
      expiresAt: reset.expiresAt.toISOString(),
      isValid: true,
    };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const reset = await this.findValidPasswordReset(dto.token);
    const email = reset.email;

    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      await this.passwordResetRepository.delete({ email });
      throw new BadRequestException('Invalid or expired reset link.');
    }

    const passwordHash = await argon2.hash(dto.password);
    await this.userRepository.update(user.id, { passwordHash });
    await this.passwordResetRepository.delete({ email });

    return {
      message: 'Password updated successfully. Please log in.',
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

  async resolveRequiresPlanSelection(user: User): Promise<boolean> {
    if (!user.organizationId) {
      return false;
    }

    if (user.role !== RegisterAs.OWNER && user.role !== RegisterAs.ADMIN) {
      return false;
    }

    const subscription = await this.subscriptionRepository.findOne({
      where: { organizationId: user.organizationId },
    });

    if (!subscription) {
      return true;
    }

    return subscription.planSelectedAt == null;
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

  private hashResetToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private async findValidPasswordReset(token: string) {
    const tokenHash = this.hashResetToken(token.trim());
    const reset = await this.passwordResetRepository.findOne({
      where: { tokenHash },
    });

    if (!reset || reset.expiresAt.getTime() < Date.now()) {
      if (reset) {
        await this.passwordResetRepository.delete({ email: reset.email });
      }

      throw new BadRequestException('Invalid or expired reset link.');
    }

    return reset;
  }

  private signAccessToken(user: User, remember = false): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      isPlatformAdmin: user.isPlatformAdmin,
      organizationId: user.organizationId,
    };

    const expiresIn = remember
      ? this.configService.get<string>('JWT_REMEMBER_EXPIRES_IN', JWT_REMEMBER_EXPIRES_IN)
      : this.configService.get<string>('JWT_SESSION_EXPIRES_IN', JWT_SESSION_EXPIRES_IN);

    return this.jwtService.sign(payload, { expiresIn: expiresIn as never });
  }

  private generateOtpCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  private async toAuthUserResponse(
    user: User,
    organization: Organization | null,
  ): Promise<AuthUserResponse> {
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
      requiresPlanSelection: await this.resolveRequiresPlanSelection(user),
    };
  }
}
