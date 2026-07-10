import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { normalizeAppUiTheme } from '../common/theme-normalize.util';
import { buildAvatarAssetUrl } from '../common/asset-upload.storage';
import { DEFAULT_ORGANIZATION_WORKSPACE_SETTINGS } from '../common/types/organization-workspace-settings.type';
import {
  canChangeOwnEmail,
  canRequestOwnEmailChange,
  getEmailChangeRequestRecipientRoles,
} from '../common/utils/email-access.util';
import { AcceptInviteDto } from '../dto/accept-invite.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { LoginDto } from '../dto/login.dto';
import { RegisterDto } from '../dto/register.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { VerifyRegisterDto } from '../dto/verify-register.dto';
import { EmailService } from '../email/email.service';
import { Organization } from '../entities/organization.entity';
import { PasswordReset } from '../entities/password-reset.entity';
import { PendingEmailChange } from '../entities/pending-email-change.entity';
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
import { OrganizationStatus } from '../enum/billing.enum';
import { MemberDepartment } from '../enum/member.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestEmailChangeDto } from './dto/email-change-request.dto';
import {
  ConfirmEmailChangeDto,
  InitiateEmailChangeDto,
} from './dto/email-change.dto';
import {
  DisableTwoFactorDto,
  EnableTwoFactorDto,
  VerifyTwoFactorDto,
} from './dto/two-factor.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUiThemeDto } from './dto/update-ui-theme.dto';
import { GitHubOAuthService } from './github-oauth.service';
import { GoogleOAuthService } from './google-oauth.service';
import type { JwtPayload } from './jwt/jwt-payload.type';
import { RegisterRateLimitService } from './rate-limit/register-rate-limit.service';
import {
  buildTwoFactorOtpAuthUrl,
  generateTwoFactorSecret,
  verifyTwoFactorCode,
} from './two-factor.util';

const OTP_TTL_MS = 10 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const JWT_REFRESH_REMEMBER_EXPIRES_IN = '30d';
const JWT_REMEMBER_EXPIRES_IN = '30d';
const JWT_SESSION_EXPIRES_IN = '30m';
const JWT_REFRESH_SESSION_EXPIRES_IN = '30m';
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
  organizationAwaitingSubscription: boolean;
  uiTheme: string;
  twoFactorEnabled: boolean;
  avatarUrl: string | null;
  authProvider: AuthProvider;
  githubConnected: boolean;
  googleConnected: boolean;
  githubLogin: string | null;
};

export type AuthTwoFactorChallengeResponse = {
  message: string;
  requiresTwoFactor: true;
  challengeToken: string;
};

export type AuthLoginResponse =
  | AuthSessionResponse
  | AuthTwoFactorChallengeResponse;

export type AuthSessionResponse = {
  message: string;
  accessToken: string;
  refreshToken: string;
  user: AuthUserResponse;
};

export type AuthRefreshResponse = {
  accessToken: string;
  refreshToken: string;
};

export type InviteValidationResponse = {
  isValid: true;
  email: string;
  fullName: string;
  role: RegisterAs;
  roleLabel: string;
  department: MemberDepartment;
  departmentLabel: string;
  organizationName: string;
  organizationSlug: string;
  inviterName: string;
  expiresAt: string;
};

const INVITE_ROLE_LABELS: Record<string, string> = {
  [RegisterAs.OWNER]: 'Owner',
  [RegisterAs.ADMIN]: 'Admin',
  [RegisterAs.MANAGER]: 'Manager',
  [RegisterAs.MEMBER]: 'Member',
};

const DEPARTMENT_LABELS: Record<MemberDepartment, string> = {
  [MemberDepartment.ENGINEERING]: 'Engineering',
  [MemberDepartment.DESIGN]: 'Design',
  [MemberDepartment.PRODUCT]: 'Product',
  [MemberDepartment.MARKETING]: 'Marketing',
  [MemberDepartment.OPERATIONS]: 'Operations',
};

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly registerRateLimitService: RegisterRateLimitService,
    private readonly emailService: EmailService,
    private readonly organizationsService: OrganizationsService,
    private readonly githubOAuthService: GitHubOAuthService,
    private readonly googleOAuthService: GoogleOAuthService,
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
    @InjectRepository(PendingEmailChange)
    private readonly pendingEmailChangeRepository: Repository<PendingEmailChange>,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  async sendRegisterOtp(dto: RegisterDto, ip: string) {
    const email = dto.email.trim().toLowerCase();
    const organizationSlug = dto.organizationSlug.trim().toLowerCase();

    if (dto.signupSource === SignupSource.INVITE) {
      if (!dto.inviteToken?.trim()) {
        throw new BadRequestException(
          'Invite token is required for invited signups.',
        );
      }

      const invite = await this.validateInviteToken(dto.inviteToken.trim());
      if (invite.email.trim().toLowerCase() !== email) {
        throw new BadRequestException(
          'This invitation was sent to a different email address.',
        );
      }

      return {
        message:
          'Invitation verified. Continue on the accept-invite page to set your password and join the workspace.',
        email,
        requiresAcceptInvite: true,
        inviteToken: dto.inviteToken.trim(),
        organizationName: invite.organizationName,
      };
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
      await this.pendingRegistrationRepository.delete({
        email: normalizedEmail,
      });
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

  async verifyRegister(dto: VerifyRegisterDto): Promise<AuthLoginResponse> {
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

    await this.organizationsService.createDefaultSubscriptionForOrganization(
      organization.id,
      pending.email,
    );

    const workspaceSettings = await this.getOrganizationWorkspaceSettings(
      organization.id,
    );

    if (this.isOrganizationTwoFactorEnforced(workspaceSettings, organization)) {
      return {
        message: `${organization.name} created successfully. Two-factor authentication required.`,
        ...this.buildTwoFactorChallengeResponse(user, false),
      };
    }

    return {
      message: `${organization.name} created successfully. You are now the organization owner.`,
      ...this.issueAuthTokens(user, false, workspaceSettings),
      user: await this.toAuthUserResponse(user, organization),
    };
  }

  async login(dto: LoginDto): Promise<AuthLoginResponse> {
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

    user.lastActiveAt = new Date();
    await this.userRepository.save(user);

    const workspaceSettings = await this.getOrganizationWorkspaceSettings(
      user.organizationId,
    );

    if (
      this.isOrganizationTwoFactorEnforced(workspaceSettings, user.organization)
    ) {
      return {
        message: 'Two-factor authentication required.',
        ...this.buildTwoFactorChallengeResponse(user, remember),
      };
    }

    return {
      message: `Welcome back, ${user.fullName}.`,
      ...this.issueAuthTokens(user, remember, workspaceSettings),
      user: await this.toAuthUserResponse(user, user.organization),
    };
  }

  getGitHubAuthorizeUrl(state: string) {
    return this.githubOAuthService.getAuthorizeUrl(state);
  }

  async loginWithGitHub(code: string): Promise<AuthSessionResponse> {
    const profile = await this.githubOAuthService.exchangeCode(code);
    let user = await this.userRepository.findOne({
      where: { githubId: profile.id },
      relations: { organization: true },
    });

    if (!user) {
      user = await this.userRepository.findOne({
        where: { email: profile.email },
        relations: { organization: true },
      });
    }

    if (user) {
      if (user.accountStatus === AccountStatus.SUSPENDED) {
        throw new UnauthorizedException('Your account has been suspended.');
      }

      if (user.authProvider === AuthProvider.GOOGLE) {
        throw new ConflictException(
          'This account uses Google sign-in. Disconnect Google from Profile → Security if you want to switch to GitHub.',
        );
      }

      user.githubId = profile.id;
      user.githubLogin = profile.login;
      user.githubAccessToken = profile.accessToken;
      if (!user.avatarUrl && profile.avatarUrl) {
        user.avatarUrl = profile.avatarUrl;
      }
      if (user.authProvider === AuthProvider.EMAIL) {
        user.authProvider = AuthProvider.GITHUB;
      }
      user.emailVerificationStatus = EmailVerificationStatus.VERIFIED;
      if (user.accountStatus === AccountStatus.PENDING) {
        user.accountStatus = AccountStatus.ACTIVE;
      }
      user.lastActiveAt = new Date();
      await this.userRepository.save(user);
    } else {
      const slugBase = profile.login
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
      const organizationSlug = await this.ensureUniqueOrgSlug(
        slugBase || `gh-${profile.id}`,
      );
      const organizationName = `${profile.name || profile.login}'s Workspace`.slice(
        0,
        50,
      );

      const organization = await this.organizationRepository.save(
        this.organizationRepository.create({
          name: organizationName,
          slug: organizationSlug,
          status: OrganizationStatus.TRIAL,
          billingEmail: profile.email,
          projectCount: 0,
        }),
      );

      const createdUser = this.userRepository.create({
        fullName: (profile.name || profile.login).slice(0, 120),
        email: profile.email,
        passwordHash: null,
        authProvider: AuthProvider.GITHUB,
        signupSource: SignupSource.DIRECT,
        role: RegisterAs.OWNER,
        emailVerificationStatus: EmailVerificationStatus.VERIFIED,
        accountStatus: AccountStatus.ACTIVE,
        isPlatformAdmin: false,
        organizationId: organization.id,
        avatarUrl: profile.avatarUrl ?? null,
        githubId: profile.id,
        githubLogin: profile.login,
        githubAccessToken: profile.accessToken,
        lastActiveAt: new Date(),
      });
      user = await this.userRepository.save(createdUser);
      user.organization = organization;

      await this.organizationsService.createDefaultSubscriptionForOrganization(
        organization.id,
        profile.email,
      );
    }

    const authenticatedUser = user;
    const workspaceSettings = await this.getOrganizationWorkspaceSettings(
      authenticatedUser.organizationId,
    );

    return {
      message: `Welcome, ${authenticatedUser.fullName}.`,
      ...this.issueAuthTokens(authenticatedUser, true, workspaceSettings),
      user: await this.toAuthUserResponse(
        authenticatedUser,
        authenticatedUser.organization,
      ),
    };
  }

  buildGitHubFrontendRedirect(session: AuthSessionResponse) {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const params = new URLSearchParams({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      remember: '1',
    });
    return `${frontendUrl.replace(/\/$/, '')}/auth/github/callback?${params.toString()}`;
  }

  buildGitHubFrontendErrorRedirect(message: string) {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const params = new URLSearchParams({ error: message });
    return `${frontendUrl.replace(/\/$/, '')}/login?${params.toString()}`;
  }

  getGoogleAuthorizeUrl(state: string) {
    return this.googleOAuthService.getAuthorizeUrl(state);
  }

  async loginWithGoogle(code: string): Promise<AuthSessionResponse> {
    const profile = await this.googleOAuthService.exchangeCode(code);
    let user = await this.userRepository.findOne({
      where: { googleId: profile.id },
      relations: { organization: true },
    });

    if (!user) {
      user = await this.userRepository.findOne({
        where: { email: profile.email },
        relations: { organization: true },
      });
    }

    if (user) {
      if (user.accountStatus === AccountStatus.SUSPENDED) {
        throw new UnauthorizedException('Your account has been suspended.');
      }

      if (user.authProvider === AuthProvider.GITHUB) {
        throw new ConflictException(
          'This account uses GitHub sign-in. Disconnect GitHub from Profile → Security if you want to switch to Google.',
        );
      }

      user.googleId = profile.id;
      user.googleAccessToken = profile.accessToken;
      if (!user.avatarUrl && profile.avatarUrl) {
        user.avatarUrl = profile.avatarUrl;
      }
      if (user.authProvider === AuthProvider.EMAIL) {
        user.authProvider = AuthProvider.GOOGLE;
      }
      user.emailVerificationStatus = EmailVerificationStatus.VERIFIED;
      if (user.accountStatus === AccountStatus.PENDING) {
        user.accountStatus = AccountStatus.ACTIVE;
      }
      user.lastActiveAt = new Date();
      await this.userRepository.save(user);
    } else {
      const emailLocal = profile.email.split('@')[0] ?? `g-${profile.id}`;
      const slugBase = emailLocal
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 40);
      const organizationSlug = await this.ensureUniqueOrgSlug(
        slugBase || `g-${profile.id.slice(0, 12)}`,
      );
      const displayName = profile.name || emailLocal;
      const organizationName = `${displayName}'s Workspace`.slice(0, 50);

      const organization = await this.organizationRepository.save(
        this.organizationRepository.create({
          name: organizationName,
          slug: organizationSlug,
          status: OrganizationStatus.TRIAL,
          billingEmail: profile.email,
          projectCount: 0,
        }),
      );

      const createdUser = this.userRepository.create({
        fullName: displayName.slice(0, 120),
        email: profile.email,
        passwordHash: null,
        authProvider: AuthProvider.GOOGLE,
        signupSource: SignupSource.DIRECT,
        role: RegisterAs.OWNER,
        emailVerificationStatus: EmailVerificationStatus.VERIFIED,
        accountStatus: AccountStatus.ACTIVE,
        isPlatformAdmin: false,
        organizationId: organization.id,
        avatarUrl: profile.avatarUrl ?? null,
        googleId: profile.id,
        googleAccessToken: profile.accessToken,
        lastActiveAt: new Date(),
      });
      user = await this.userRepository.save(createdUser);
      user.organization = organization;

      await this.organizationsService.createDefaultSubscriptionForOrganization(
        organization.id,
        profile.email,
      );
    }

    const authenticatedUser = user;
    const workspaceSettings = await this.getOrganizationWorkspaceSettings(
      authenticatedUser.organizationId,
    );

    return {
      message: `Welcome, ${authenticatedUser.fullName}.`,
      ...this.issueAuthTokens(authenticatedUser, true, workspaceSettings),
      user: await this.toAuthUserResponse(
        authenticatedUser,
        authenticatedUser.organization,
      ),
    };
  }

  buildGoogleFrontendRedirect(session: AuthSessionResponse) {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const params = new URLSearchParams({
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      remember: '1',
    });
    return `${frontendUrl.replace(/\/$/, '')}/auth/google/callback?${params.toString()}`;
  }

  buildGoogleFrontendErrorRedirect(message: string) {
    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const params = new URLSearchParams({ error: message });
    return `${frontendUrl.replace(/\/$/, '')}/login?${params.toString()}`;
  }

  async unlinkGitHub(userId: string): Promise<AuthUserResponse> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { organization: true },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (!user.githubId) {
      throw new BadRequestException('GitHub is not connected to this account.');
    }

    user.githubId = null;
    user.githubLogin = null;
    user.githubAccessToken = null;

    if (user.authProvider === AuthProvider.GITHUB) {
      user.authProvider = user.googleId
        ? AuthProvider.GOOGLE
        : AuthProvider.EMAIL;
    }

    await this.userRepository.save(user);
    return this.toAuthUserResponse(user, user.organization);
  }

  async unlinkGoogle(userId: string): Promise<AuthUserResponse> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { organization: true },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (!user.googleId) {
      throw new BadRequestException('Google is not connected to this account.');
    }

    user.googleId = null;
    user.googleAccessToken = null;

    if (user.authProvider === AuthProvider.GOOGLE) {
      user.authProvider = user.githubId
        ? AuthProvider.GITHUB
        : AuthProvider.EMAIL;
    }

    await this.userRepository.save(user);
    return this.toAuthUserResponse(user, user.organization);
  }

  private async ensureUniqueOrgSlug(base: string) {
    let candidate = base;
    let attempt = 0;
    while (
      await this.organizationRepository.findOne({ where: { slug: candidate } })
    ) {
      attempt += 1;
      candidate = `${base}-${attempt}`.slice(0, 50);
    }
    return candidate;
  }

  async verifyTwoFactorChallenge(
    dto: VerifyTwoFactorDto,
  ): Promise<AuthSessionResponse> {
    const { user, remember, challengeId } =
      await this.resolveUserFromTwoFactorChallenge(dto.challengeToken);

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

    const organization =
      user.organization ??
      (user.organizationId
        ? await this.organizationRepository.findOne({
            where: { id: user.organizationId },
          })
        : null);

    const workspaceSettings = await this.getOrganizationWorkspaceSettings(
      user.organizationId,
    );

    if (
      !this.isOrganizationTwoFactorEnforced(workspaceSettings, organization)
    ) {
      throw new UnauthorizedException(
        'Two-factor authentication is not required for this workspace.',
      );
    }

    if (
      !organization?.twoFactorSecret ||
      !(await verifyTwoFactorCode(organization.twoFactorSecret, dto.code))
    ) {
      throw new UnauthorizedException('Invalid authentication code.');
    }

    user.twoFactorChallengeId = null;
    await this.userRepository.save(user);

    return this.completeAuthenticatedSession(user, remember);
  }

  async setupTwoFactor(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const secret = generateTwoFactorSecret();
    user.twoFactorSecret = secret;
    user.twoFactorEnabled = false;
    await this.userRepository.save(user);

    return {
      secret,
      otpauthUrl: buildTwoFactorOtpAuthUrl(user.email, secret),
    };
  }

  async enableTwoFactor(userId: string, dto: EnableTwoFactorDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user?.twoFactorSecret) {
      throw new BadRequestException(
        'Start two-factor setup before enabling it.',
      );
    }

    if (
      !user.twoFactorSecret ||
      !(await verifyTwoFactorCode(user.twoFactorSecret, dto.code))
    ) {
      throw new UnauthorizedException('Invalid authentication code.');
    }

    user.twoFactorEnabled = true;
    await this.userRepository.save(user);

    return {
      message: 'Two-factor authentication enabled successfully.',
      twoFactorEnabled: true,
    };
  }

  async disableTwoFactor(userId: string, dto: DisableTwoFactorDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (
      !user?.passwordHash ||
      !user.twoFactorSecret ||
      !user.twoFactorEnabled
    ) {
      throw new BadRequestException(
        'Two-factor authentication is not enabled.',
      );
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      dto.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid password.');
    }

    if (
      !user.twoFactorSecret ||
      !(await verifyTwoFactorCode(user.twoFactorSecret, dto.code))
    ) {
      throw new UnauthorizedException('Invalid authentication code.');
    }

    const workspaceSettings = await this.getOrganizationWorkspaceSettings(
      user.organizationId,
    );

    if (workspaceSettings.twoFactorRequired) {
      throw new ForbiddenException(
        'Two-factor authentication is required by your workspace and cannot be disabled.',
      );
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = null;
    await this.userRepository.save(user);

    return {
      message: 'Two-factor authentication disabled successfully.',
      twoFactorEnabled: false,
    };
  }

  async getTwoFactorStatus(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const workspaceSettings = await this.getOrganizationWorkspaceSettings(
      user.organizationId,
    );

    return {
      enabled: user.twoFactorEnabled,
      requiredByWorkspace: workspaceSettings.twoFactorRequired,
      pendingSetup: Boolean(user.twoFactorSecret && !user.twoFactorEnabled),
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

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<AuthUserResponse> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    user.fullName = dto.fullName;
    await this.userRepository.save(user);

    return this.toAuthUserResponse(user, user.organization);
  }

  async updateAvatar(
    userId: string,
    file: Express.Multer.File,
  ): Promise<AuthUserResponse> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    user.avatarUrl = buildAvatarAssetUrl(file.filename);
    await this.userRepository.save(user);

    return this.toAuthUserResponse(user, user.organization);
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (!user.passwordHash) {
      throw new BadRequestException('Password verification is required.');
    }

    const isPasswordValid = await argon2.verify(
      user.passwordHash,
      dto.currentPassword,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException(
        'New password must be different from your current password.',
      );
    }

    user.passwordHash = await argon2.hash(dto.newPassword);
    await this.userRepository.save(user);

    return { message: 'Password updated successfully' };
  }

  async updateUiTheme(
    userId: string,
    dto: UpdateUiThemeDto,
  ): Promise<AuthUserResponse> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    user.uiTheme = normalizeAppUiTheme(dto.uiTheme);
    await this.userRepository.save(user);

    return this.toAuthUserResponse(user, user.organization);
  }

  async initiateEmailChange(user: JwtPayload, dto: InitiateEmailChangeDto) {
    if (!canChangeOwnEmail(user.role)) {
      throw new ForbiddenException(
        'Only the organization owner can change their own login email.',
      );
    }

    const account = await this.userRepository.findOne({
      where: { id: user.sub },
    });

    if (!account) {
      throw new UnauthorizedException('User not found.');
    }

    if (!account.passwordHash) {
      throw new BadRequestException('Password verification is required.');
    }

    const isPasswordValid = await argon2.verify(
      account.passwordHash,
      dto.currentPassword,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Current password is incorrect.');
    }

    const newEmail = dto.newEmail.trim().toLowerCase();

    if (newEmail === account.email) {
      throw new BadRequestException(
        'New email must be different from your current email.',
      );
    }

    const existingUser = await this.userRepository.findOne({
      where: { email: newEmail },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists.');
    }

    const otp = this.generateOtpCode();
    const otpHash = await argon2.hash(otp);
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);

    await this.pendingEmailChangeRepository.save({
      userId: account.id,
      newEmail,
      otpHash,
      expiresAt,
    });

    await this.emailService.sendEmailChangeOtpEmail({
      to: newEmail,
      fullName: account.fullName,
      otp,
    });

    return {
      message: `Verification code sent to ${newEmail}`,
      email: newEmail,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async confirmEmailChange(user: JwtPayload, dto: ConfirmEmailChangeDto) {
    if (!canChangeOwnEmail(user.role)) {
      throw new ForbiddenException(
        'Only the organization owner can change their own login email.',
      );
    }

    const account = await this.userRepository.findOne({
      where: { id: user.sub },
      relations: { organization: true },
    });

    if (!account) {
      throw new UnauthorizedException('User not found.');
    }

    const newEmail = dto.newEmail.trim().toLowerCase();
    const pending = await this.pendingEmailChangeRepository.findOne({
      where: { userId: account.id, newEmail },
    });

    if (!pending || pending.expiresAt.getTime() < Date.now()) {
      if (pending) {
        await this.pendingEmailChangeRepository.delete({ userId: account.id });
      }

      throw new BadRequestException(
        'Invalid or expired OTP. Please try again.',
      );
    }

    const isOtpValid = await argon2.verify(pending.otpHash, dto.otp);

    if (!isOtpValid) {
      throw new BadRequestException(
        'Invalid or expired OTP. Please try again.',
      );
    }

    const existingUser = await this.userRepository.findOne({
      where: { email: newEmail },
    });

    if (existingUser && existingUser.id !== account.id) {
      throw new ConflictException('An account with this email already exists.');
    }

    account.email = newEmail;
    account.emailVerificationStatus = EmailVerificationStatus.VERIFIED;
    await this.userRepository.save(account);
    await this.pendingEmailChangeRepository.delete({ userId: account.id });

    if (account.role === RegisterAs.OWNER && account.organizationId) {
      const organization = await this.organizationRepository.findOne({
        where: { id: account.organizationId },
      });

      if (organization) {
        organization.billingEmail = newEmail;
        await this.organizationRepository.save(organization);
      }
    }

    return {
      message: 'Email address updated successfully.',
      email: newEmail,
      user: await this.toAuthUserResponse(account, account.organization),
    };
  }

  async getEmailChangeRequestRecipients(user: JwtPayload) {
    if (!canRequestOwnEmailChange(user.role)) {
      throw new ForbiddenException('You cannot request an email change.');
    }

    if (!user.organizationId) {
      throw new BadRequestException('Organization membership is required.');
    }

    const organization = await this.organizationRepository.findOne({
      where: { id: user.organizationId },
      relations: { users: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    const targetRoles = getEmailChangeRequestRecipientRoles(user.role);
    const recipients = (organization.users ?? [])
      .filter(
        (member) =>
          targetRoles.includes(member.role) &&
          member.accountStatus === AccountStatus.ACTIVE &&
          member.id !== user.sub,
      )
      .sort((left, right) => left.fullName.localeCompare(right.fullName))
      .map((member) => ({
        id: member.id,
        fullName: member.fullName,
        email: member.email,
        role: member.role,
      }));

    return { data: recipients };
  }

  async submitEmailChangeRequest(user: JwtPayload, dto: RequestEmailChangeDto) {
    if (!canRequestOwnEmailChange(user.role)) {
      throw new ForbiddenException('You cannot request an email change.');
    }

    if (!user.organizationId) {
      throw new BadRequestException('Organization membership is required.');
    }

    const requester = await this.userRepository.findOne({
      where: { id: user.sub },
    });

    if (!requester) {
      throw new UnauthorizedException('User not found.');
    }

    const currentEmail = dto.currentEmail.trim().toLowerCase();
    const newEmail = dto.newEmail.trim().toLowerCase();

    if (currentEmail !== requester.email) {
      throw new BadRequestException(
        'Current email does not match your account.',
      );
    }

    if (newEmail === currentEmail) {
      throw new BadRequestException(
        'New email must be different from your current email.',
      );
    }

    const existingUser = await this.userRepository.findOne({
      where: { email: newEmail },
    });

    if (existingUser) {
      throw new ConflictException('An account with this email already exists.');
    }

    const organization = await this.organizationRepository.findOne({
      where: { id: user.organizationId },
      relations: { users: true },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found.');
    }

    const targetRoles = getEmailChangeRequestRecipientRoles(user.role);
    const eligibleRecipients = new Map(
      (organization.users ?? [])
        .filter(
          (member) =>
            targetRoles.includes(member.role) &&
            member.accountStatus === AccountStatus.ACTIVE &&
            member.id !== user.sub,
        )
        .map((member) => [member.id, member]),
    );

    const uniqueRecipientIds = [...new Set(dto.recipientIds)];

    if (uniqueRecipientIds.length === 0) {
      throw new BadRequestException('Select at least one recipient.');
    }

    const selectedRecipients = uniqueRecipientIds.map((recipientId) => {
      const recipient = eligibleRecipients.get(recipientId);

      if (!recipient) {
        throw new BadRequestException(
          'One or more selected recipients are invalid.',
        );
      }

      return recipient;
    });

    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:5173',
    );
    const settingsUrl = `${frontendUrl.replace(/\/$/, '')}/settings`;
    const requesterRoleLabel =
      INVITE_ROLE_LABELS[requester.role] ?? requester.role;

    await Promise.all(
      selectedRecipients.map((recipient) =>
        this.emailService.sendEmailChangeRequestEmail({
          to: recipient.email,
          recipientName: recipient.fullName,
          requesterName: requester.fullName,
          requesterRoleLabel,
          organizationName: organization.name,
          subject: dto.subject.trim(),
          currentEmail,
          newEmail,
          reason: dto.reason.trim(),
          settingsUrl,
        }),
      ),
    );

    return {
      message: `Email change request sent to ${selectedRecipients.length} recipient(s).`,
      recipientCount: selectedRecipients.length,
    };
  }

  async validateInviteToken(token: string): Promise<InviteValidationResponse> {
    const member = await this.findValidInviteMember(token.trim());
    const organization = member.organization;

    if (!organization) {
      throw new BadRequestException('This invitation is no longer valid.');
    }

    const inviter = member.invitedById
      ? await this.userRepository.findOne({ where: { id: member.invitedById } })
      : null;
    const department = member.department ?? MemberDepartment.ENGINEERING;

    return {
      isValid: true,
      email: member.email,
      fullName: member.fullName,
      role: member.role,
      roleLabel: INVITE_ROLE_LABELS[member.role] ?? 'Member',
      department,
      departmentLabel: DEPARTMENT_LABELS[department],
      organizationName: organization.name,
      organizationSlug: organization.slug,
      inviterName: inviter?.fullName ?? 'Your workspace admin',
      expiresAt: member.inviteExpiresAt!.toISOString(),
    };
  }

  async acceptInvite(dto: AcceptInviteDto): Promise<AuthLoginResponse> {
    const member = await this.findValidInviteMember(dto.token.trim());
    const organization = member.organization;

    if (!organization) {
      throw new BadRequestException('This invitation is no longer valid.');
    }

    if (member.accountStatus === AccountStatus.SUSPENDED) {
      throw new BadRequestException('This invitation has been revoked.');
    }

    const fullName = dto.fullName?.trim() || member.fullName;
    const passwordHash = await argon2.hash(dto.password);

    member.fullName = fullName;
    member.passwordHash = passwordHash;
    member.accountStatus = AccountStatus.ACTIVE;
    member.emailVerificationStatus = EmailVerificationStatus.VERIFIED;
    member.inviteToken = null;
    member.inviteExpiresAt = null;
    member.lastActiveAt = new Date();

    const inviterUserId = member.invitedById;

    await this.userRepository.save(member);

    if (inviterUserId && organization.id) {
      void this.notificationsService.notifyInviteAccepted({
        organizationId: organization.id,
        inviterUserId,
        memberUserId: member.id,
        memberName: fullName,
      });
    }

    const workspaceSettings = await this.getOrganizationWorkspaceSettings(
      organization.id,
    );

    if (this.isOrganizationTwoFactorEnforced(workspaceSettings, organization)) {
      return {
        message: `Welcome to ${organization.name}, ${fullName}. Two-factor authentication required.`,
        ...this.buildTwoFactorChallengeResponse(member, false),
      };
    }

    return {
      message: `Welcome to ${organization.name}, ${fullName}.`,
      ...this.issueAuthTokens(member, false, workspaceSettings),
      user: await this.toAuthUserResponse(member, organization),
    };
  }

  async resolveOrganizationAwaitingSubscription(user: User): Promise<boolean> {
    if (!user.organizationId) {
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

  async resolveRequiresPlanSelection(user: User): Promise<boolean> {
    if (user.role !== RegisterAs.OWNER && user.role !== RegisterAs.ADMIN) {
      return false;
    }

    return this.resolveOrganizationAwaitingSubscription(user);
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

    const isPasswordValid = await argon2.verify(pending.passwordHash, password);

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

  private async findValidInviteMember(token: string) {
    const member = await this.userRepository.findOne({
      where: { inviteToken: token },
      relations: { organization: true },
    });

    if (!member) {
      throw new BadRequestException('Invalid or expired invitation link.');
    }

    if (member.signupSource !== SignupSource.INVITE) {
      throw new BadRequestException('Invalid or expired invitation link.');
    }

    if (
      !member.inviteExpiresAt ||
      member.inviteExpiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException(
        'This invitation has expired. Ask your workspace admin to resend it.',
      );
    }

    if (member.accountStatus !== AccountStatus.PENDING) {
      if (member.passwordHash) {
        throw new BadRequestException(
          'This invitation has already been accepted. Please log in instead.',
        );
      }

      throw new BadRequestException('This invitation is no longer valid.');
    }

    if (member.passwordHash) {
      throw new BadRequestException(
        'This invitation has already been accepted. Please log in instead.',
      );
    }

    return member;
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

  private issueAuthTokens(
    user: User,
    remember = false,
    workspaceSettings = DEFAULT_ORGANIZATION_WORKSPACE_SETTINGS,
  ): AuthRefreshResponse {
    return {
      accessToken: this.signAccessToken(user, remember, workspaceSettings),
      refreshToken: this.signRefreshToken(user, remember),
    };
  }

  private signAccessToken(
    user: User,
    remember = false,
    workspaceSettings = DEFAULT_ORGANIZATION_WORKSPACE_SETTINGS,
  ): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      isPlatformAdmin: user.isPlatformAdmin,
      organizationId: user.organizationId,
      tokenVersion: user.tokenVersion ?? 0,
      remember: remember === true,
    };

    const sessionExpiresIn = this.configService.get<string>(
      'JWT_SESSION_EXPIRES_IN',
      JWT_SESSION_EXPIRES_IN,
    );

    const rememberExpiresIn = this.configService.get<string>(
      'JWT_REMEMBER_EXPIRES_IN',
      JWT_REMEMBER_EXPIRES_IN,
    );

    const expiresIn =
      workspaceSettings.sessionTimeoutEnabled || !remember
        ? sessionExpiresIn
        : rememberExpiresIn;

    return this.jwtService.sign(payload, { expiresIn: expiresIn as never });
  }

  private getRefreshSecret() {
    const secret = this.configService.get<string>('JWT_REFRESH_SECRET');
    if (!secret) {
      throw new Error('JWT_REFRESH_SECRET is not configured.');
    }
    return secret;
  }

  private signRefreshToken(user: User, remember = false): string {
    const sessionExpiresIn = this.configService.get<string>(
      'JWT_REFRESH_SESSION_EXPIRES_IN',
      JWT_REFRESH_SESSION_EXPIRES_IN,
    );

    const rememberExpiresIn = this.configService.get<string>(
      'JWT_REFRESH_REMEMBER_EXPIRES_IN',
      JWT_REFRESH_REMEMBER_EXPIRES_IN,
    );

    return this.jwtService.sign(
      {
        sub: user.id,
        type: 'refresh',
        remember: remember === true,
        tokenVersion: user.tokenVersion ?? 0,
      },
      {
        secret: this.getRefreshSecret(),
        expiresIn: (remember ? rememberExpiresIn : sessionExpiresIn) as never,
      },
    );
  }

  private verifyRefreshToken(refreshToken: string) {
    let payload: {
      sub?: string;
      type?: string;
      remember?: boolean;
      tokenVersion?: number;
    };

    try {
      payload = this.jwtService.verify(refreshToken, {
        secret: this.getRefreshSecret(),
      });
    } catch {
      throw new UnauthorizedException(
        'Refresh token expired. Please sign in again.',
      );
    }

    if (payload.type !== 'refresh' || !payload.sub) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    return {
      sub: payload.sub,
      remember: payload.remember === true,
      tokenVersion: payload.tokenVersion ?? 0,
    };
  }

  private isOrganizationTwoFactorEnforced(
    workspaceSettings: {
      twoFactorRequired: boolean;
    },
    organization: Organization | null | undefined,
  ) {
    return (
      workspaceSettings.twoFactorRequired &&
      Boolean(organization?.twoFactorConfigured && organization.twoFactorSecret)
    );
  }

  private buildTwoFactorChallengeResponse(
    user: User,
    remember: boolean,
  ): Omit<AuthTwoFactorChallengeResponse, 'message'> {
    const challengeId = randomUUID();
    user.twoFactorChallengeId = challengeId;
    void this.userRepository.update(user.id, {
      twoFactorChallengeId: challengeId,
    });

    return {
      requiresTwoFactor: true,
      challengeToken: this.signTwoFactorChallengeToken(
        user,
        remember,
        challengeId,
      ),
    };
  }

  private async resolveUserFromTwoFactorChallenge(challengeToken: string) {
    let payload: {
      sub?: string;
      type?: string;
      remember?: boolean;
      challengeId?: string;
    };

    try {
      payload = this.jwtService.verify(challengeToken);
    } catch {
      throw new UnauthorizedException(
        'Two-factor challenge expired. Please sign in again.',
      );
    }

    if (payload.type !== '2fa_challenge' || !payload.sub) {
      throw new UnauthorizedException('Invalid two-factor challenge.');
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found.');
    }

    if (
      !payload.challengeId ||
      payload.challengeId !== user.twoFactorChallengeId
    ) {
      throw new UnauthorizedException(
        'Two-factor challenge expired. Please sign in again.',
      );
    }

    return {
      user,
      remember: payload.remember === true,
      challengeId: payload.challengeId,
    };
  }

  private async completeAuthenticatedSession(
    user: User,
    remember: boolean,
    message?: string,
  ) {
    user.lastActiveAt = new Date();
    await this.userRepository.save(user);

    const workspaceSettings = await this.getOrganizationWorkspaceSettings(
      user.organizationId,
    );

    return {
      message: message ?? `Welcome back, ${user.fullName}.`,
      ...this.issueAuthTokens(user, remember, workspaceSettings),
      user: await this.toAuthUserResponse(user, user.organization),
    };
  }

  async refreshSession(refreshToken: string): Promise<AuthRefreshResponse> {
    const payload = this.verifyRefreshToken(refreshToken);

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: { organization: true },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid refresh token.');
    }

    if (user.accountStatus === AccountStatus.SUSPENDED) {
      throw new UnauthorizedException('Your account has been suspended.');
    }

    if (user.accountStatus === AccountStatus.PENDING) {
      throw new UnauthorizedException('Your account is not active yet.');
    }

    if (
      user.emailVerificationStatus !== EmailVerificationStatus.VERIFIED &&
      !user.isPlatformAdmin
    ) {
      throw new UnauthorizedException(
        'Please verify your email before continuing.',
      );
    }

    const tokenVersion = payload.tokenVersion ?? 0;
    if (tokenVersion !== (user.tokenVersion ?? 0)) {
      throw new UnauthorizedException(
        'Your session is no longer valid. Please sign in again.',
      );
    }

    const remember = payload.remember === true;
    const workspaceSettings = await this.getOrganizationWorkspaceSettings(
      user.organizationId,
    );

    return this.issueAuthTokens(user, remember, workspaceSettings);
  }

  async invalidateUserSessions(userId: string) {
    await this.userRepository.increment({ id: userId }, 'tokenVersion', 1);
    await this.userRepository.update(userId, { twoFactorChallengeId: null });
  }

  private signTwoFactorChallengeToken(
    user: User,
    remember = false,
    challengeId?: string,
  ) {
    return this.jwtService.sign(
      {
        sub: user.id,
        type: '2fa_challenge',
        remember: remember === true,
        ...(challengeId ? { challengeId } : {}),
      },
      { expiresIn: '10m' },
    );
  }

  private async getOrganizationWorkspaceSettings(
    organizationId: string | null,
  ) {
    if (!organizationId) {
      return DEFAULT_ORGANIZATION_WORKSPACE_SETTINGS;
    }

    const organization = await this.organizationRepository.findOne({
      where: { id: organizationId },
    });

    return (
      organization?.workspaceSettings ?? DEFAULT_ORGANIZATION_WORKSPACE_SETTINGS
    );
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
      organizationAwaitingSubscription:
        await this.resolveOrganizationAwaitingSubscription(user),
      uiTheme: normalizeAppUiTheme(user.uiTheme),
      twoFactorEnabled: user.twoFactorEnabled,
      avatarUrl: user.avatarUrl ?? null,
      authProvider: user.authProvider,
      githubConnected: Boolean(user.githubId),
      googleConnected: Boolean(user.googleId),
      githubLogin: user.githubLogin ?? null,
    };
  }
}
