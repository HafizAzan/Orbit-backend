import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
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
