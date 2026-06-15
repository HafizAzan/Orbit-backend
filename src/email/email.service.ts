import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import { buildRegisterOtpEmailHtml } from './templates/register-otp.template';

const OTP_TTL_MINUTES = 10;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not configured.');
    }

    this.resend = new Resend(apiKey);
    this.from = this.configService.get<string>(
      'EMAIL_FROM',
      'FlowSync <onboarding@resend.dev>',
    );
  }

  async sendRegisterOtpEmail(params: {
    to: string;
    fullName: string;
    otp: string;
  }): Promise<void> {
    const to = params.to.trim().toLowerCase();

    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject: 'Your FlowSync verification code',
      html: buildRegisterOtpEmailHtml({
        fullName: params.fullName,
        otp: params.otp,
        expiresInMinutes: OTP_TTL_MINUTES,
      }),
    });

    if (error) {
      this.logger.error(`Failed to send OTP email to ${to}`, error);
      throw new ServiceUnavailableException(
        'Unable to send verification email. Please try again.',
      );
    }
  }
}
