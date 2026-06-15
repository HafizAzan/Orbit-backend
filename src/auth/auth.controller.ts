import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { getClientIp } from '../common/utils/get-client-ip.util';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { RegisterPendingQueryDto } from '../dto/register-pending-query.dto';
import { ResendRegisterOtpDto } from '../dto/resend-register-otp.dto';
import { VerifyRegisterDto } from '../dto/verify-register.dto';
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

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getMe(@CurrentUser() user: JwtPayload) {
    return this.authService.getMe(user.sub);
  }
}
