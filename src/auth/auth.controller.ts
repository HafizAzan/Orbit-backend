import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { getClientIp } from '../common/utils/get-client-ip.util';
import { ForgotPasswordDto } from '../dto/forgot-password.dto';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RegisterPendingQueryDto } from '../dto/register-pending-query.dto';
import { ResendRegisterOtpDto } from '../dto/resend-register-otp.dto';
import { ResetPasswordDto } from '../dto/reset-password.dto';
import { ValidateResetTokenQueryDto } from '../dto/validate-reset-token-query.dto';
import { VerifyRegisterDto } from '../dto/verify-register.dto';
import { ValidateInviteTokenQueryDto } from '../dto/validate-invite-token-query.dto';
import { AcceptInviteDto } from '../dto/accept-invite.dto';
import { CurrentUser } from './decorators/current-user.decorator';
import { AuthService } from './auth.service';
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
}
