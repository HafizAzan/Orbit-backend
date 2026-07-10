import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { avatarUploadOptions } from '../common/asset-upload.storage';
import { getClientIp } from '../common/utils/get-client-ip.util';
import { AcceptInviteDto } from '../dto/accept-invite.dto';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { LoginDto } from '../dto/login.dto';
import { RegisterPendingQueryDto } from '../dto/register-pending-query.dto';
import { RegisterDto } from '../dto/register.dto';
import { ResendRegisterOtpDto } from '../dto/resend-register-otp.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { ValidateInviteTokenQueryDto } from '../dto/validate-invite-token-query.dto';
import { ValidateResetTokenQueryDto } from '../dto/validate-reset-token-query.dto';
import { VerifyRegisterDto } from '../dto/verify-register.dto';
import { AuthService } from './auth.service';
import { CurrentUser } from './decorators/current-user.decorator';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestEmailChangeDto } from './dto/email-change-request.dto';
import {
  ConfirmEmailChangeDto,
  InitiateEmailChangeDto,
} from './dto/email-change.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import {
  DisableTwoFactorDto,
  EnableTwoFactorDto,
  VerifyTwoFactorDto,
} from './dto/two-factor.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUiThemeDto } from './dto/update-ui-theme.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { JwtPayload } from './jwt/jwt-payload.type';
import { RegisterRateLimitGuard } from './rate-limit/register-rate-limit.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register/send-otp')
  @UseGuards(RegisterRateLimitGuard)
  sendRegisterOtp(@Body() dto: RegisterDto, @Req() request: Request) {
    const ip = getClientIp(request);
    return this.authService.sendRegisterOtp(dto, ip);
  }

  @Get('register/pending')
  getRegisterPending(@Query() query: RegisterPendingQueryDto) {
    return this.authService.getRegisterPending(query.email);
  }

  @Post('register/resend-otp')
  resendRegisterOtp(@Body() dto: ResendRegisterOtpDto) {
    return this.authService.resendRegisterOtp(dto.email);
  }

  @Post('register/verify')
  verifyRegister(@Body() dto: VerifyRegisterDto) {
    return this.authService.verifyRegister(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('github')
  startGitHubOAuth(@Res() response: Response) {
    const state = randomBytes(16).toString('hex');
    const url = this.authService.getGitHubAuthorizeUrl(state);
    response.setHeader(
      'Set-Cookie',
      `orbit_gh_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    );
    return response.redirect(url);
  }

  @Get('github/callback')
  async gitHubOAuthCallback(
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Query('state') state: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (error || !code) {
      return response.redirect(
        this.authService.buildGitHubFrontendErrorRedirect(
          error || 'GitHub authorization was cancelled.',
        ),
      );
    }

    const cookieHeader = request.headers.cookie ?? '';
    const expectedState = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('orbit_gh_oauth_state='))
      ?.split('=')
      .slice(1)
      .join('=');

    if (expectedState && state && expectedState !== state) {
      return response.redirect(
        this.authService.buildGitHubFrontendErrorRedirect(
          'Invalid GitHub OAuth state.',
        ),
      );
    }

    try {
      const session = await this.authService.loginWithGitHub(code);
      response.setHeader(
        'Set-Cookie',
        'orbit_gh_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      );
      return response.redirect(
        this.authService.buildGitHubFrontendRedirect(session),
      );
    } catch (err) {
      return response.redirect(
        this.authService.buildGitHubFrontendErrorRedirect(
          this.resolveOAuthErrorMessage(err, 'GitHub sign-in failed.'),
        ),
      );
    }
  }

  @Get('google')
  startGoogleOAuth(@Res() response: Response) {
    const state = randomBytes(16).toString('hex');
    const url = this.authService.getGoogleAuthorizeUrl(state);
    response.setHeader(
      'Set-Cookie',
      `orbit_google_oauth_state=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600`,
    );
    return response.redirect(url);
  }

  @Get('google/callback')
  async googleOAuthCallback(
    @Query('code') code: string | undefined,
    @Query('error') error: string | undefined,
    @Query('state') state: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    if (error || !code) {
      return response.redirect(
        this.authService.buildGoogleFrontendErrorRedirect(
          error || 'Google authorization was cancelled.',
        ),
      );
    }

    const cookieHeader = request.headers.cookie ?? '';
    const expectedState = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('orbit_google_oauth_state='))
      ?.split('=')
      .slice(1)
      .join('=');

    if (expectedState && state && expectedState !== state) {
      return response.redirect(
        this.authService.buildGoogleFrontendErrorRedirect(
          'Invalid Google OAuth state.',
        ),
      );
    }

    try {
      const session = await this.authService.loginWithGoogle(code);
      response.setHeader(
        'Set-Cookie',
        'orbit_google_oauth_state=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      );
      return response.redirect(
        this.authService.buildGoogleFrontendRedirect(session),
      );
    } catch (err) {
      return response.redirect(
        this.authService.buildGoogleFrontendErrorRedirect(
          this.resolveOAuthErrorMessage(err, 'Google sign-in failed.'),
        ),
      );
    }
  }

  private resolveOAuthErrorMessage(err: unknown, fallback: string) {
    if (err instanceof HttpException) {
      const payload = err.getResponse();
      if (typeof payload === 'string' && payload.trim()) {
        return payload;
      }
      if (
        payload &&
        typeof payload === 'object' &&
        'message' in payload
      ) {
        const message = (payload as { message?: string | string[] }).message;
        if (Array.isArray(message) && message[0]) {
          return message[0];
        }
        if (typeof message === 'string' && message.trim()) {
          return message;
        }
      }
    }

    if (err instanceof Error && err.message.trim()) {
      return err.message;
    }

    return fallback;
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshSession(dto.refreshToken);
  }

  @Post('2fa/verify')
  verifyTwoFactor(@Body() dto: VerifyTwoFactorDto) {
    return this.authService.verifyTwoFactorChallenge(dto);
  }

  @Get('2fa/status')
  @UseGuards(JwtAuthGuard)
  getTwoFactorStatus(@CurrentUser() user: JwtPayload) {
    return this.authService.getTwoFactorStatus(user.sub);
  }

  @Post('2fa/setup')
  @UseGuards(JwtAuthGuard)
  setupTwoFactor(@CurrentUser() user: JwtPayload) {
    return this.authService.setupTwoFactor(user.sub);
  }

  @Post('2fa/enable')
  @UseGuards(JwtAuthGuard)
  enableTwoFactor(
    @CurrentUser() user: JwtPayload,
    @Body() dto: EnableTwoFactorDto,
  ) {
    return this.authService.enableTwoFactor(user.sub, dto);
  }

  @Post('2fa/disable')
  @UseGuards(JwtAuthGuard)
  disableTwoFactor(
    @CurrentUser() user: JwtPayload,
    @Body() dto: DisableTwoFactorDto,
  ) {
    return this.authService.disableTwoFactor(user.sub, dto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout() {
    return this.authService.logout();
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Get('reset-password/validate')
  validateResetToken(@Query() query: ValidateResetTokenQueryDto) {
    return this.authService.validateResetToken(query.token);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('invites/validate')
  validateInviteToken(@Query() query: ValidateInviteTokenQueryDto) {
    return this.authService.validateInviteToken(query.token);
  }

  @Post('invites/accept')
  acceptInvite(@Body() dto: AcceptInviteDto) {
    return this.authService.acceptInvite(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }

  @Patch('me/profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(user.sub, dto);
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', avatarUploadOptions))
  updateAvatar(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('Avatar file is required.');
    }
    return this.authService.updateAvatar(user.sub, file);
  }

  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.sub, dto);
  }

  @Patch('me/ui-theme')
  @UseGuards(JwtAuthGuard)
  updateUiTheme(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateUiThemeDto,
  ) {
    return this.authService.updateUiTheme(user.sub, dto);
  }

  @Post('me/oauth/github/unlink')
  @UseGuards(JwtAuthGuard)
  unlinkGitHub(@CurrentUser() user: JwtPayload) {
    return this.authService.unlinkGitHub(user.sub);
  }

  @Post('me/oauth/google/unlink')
  @UseGuards(JwtAuthGuard)
  unlinkGoogle(@CurrentUser() user: JwtPayload) {
    return this.authService.unlinkGoogle(user.sub);
  }

  @Post('me/email/initiate')
  @UseGuards(JwtAuthGuard)
  initiateEmailChange(
    @CurrentUser() user: JwtPayload,
    @Body() dto: InitiateEmailChangeDto,
  ) {
    return this.authService.initiateEmailChange(user, dto);
  }

  @Post('me/email/confirm')
  @UseGuards(JwtAuthGuard)
  confirmEmailChange(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConfirmEmailChangeDto,
  ) {
    return this.authService.confirmEmailChange(user, dto);
  }

  @Get('me/email/request-recipients')
  @UseGuards(JwtAuthGuard)
  getEmailChangeRequestRecipients(@CurrentUser() user: JwtPayload) {
    return this.authService.getEmailChangeRequestRecipients(user);
  }

  @Post('me/email/request')
  @UseGuards(JwtAuthGuard)
  submitEmailChangeRequest(
    @CurrentUser() user: JwtPayload,
    @Body() dto: RequestEmailChangeDto,
  ) {
    return this.authService.submitEmailChangeRequest(user, dto);
  }
}
