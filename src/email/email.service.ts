import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { buildRegisterOtpEmailHtml } from './templates/register-otp.template';
import { buildPasswordResetEmailHtml } from './templates/password-reset.template';

const OTP_TTL_MINUTES = 10;
const PASSWORD_RESET_TTL_MINUTES = 60;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT', '587'));
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.getSmtpPassword();

    if (!host || !user || !pass) {
      throw new Error(
        'SMTP_HOST, SMTP_USER, and SMTP_PASSWORD are required.',
      );
    }

    this.from = this.configService.get<string>(
      'EMAIL_FROM',
      `FlowSync <${user}>`,
    );

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user,
        pass,
      },
    });
  }

  async sendRegisterOtpEmail(params: {
    to: string;
    fullName: string;
    otp: string;
  }): Promise<void> {
    const to = params.to.trim().toLowerCase();

    await this.sendEmail({
      to,
      subject: 'Your FlowSync verification code',
      html: buildRegisterOtpEmailHtml({
        fullName: params.fullName,
        otp: params.otp,
        expiresInMinutes: OTP_TTL_MINUTES,
      }),
      failureMessage: 'Unable to send verification email. Please try again.',
    });
  }

  async sendPasswordResetEmail(params: {
    to: string;
    fullName: string;
    resetUrl: string;
  }): Promise<void> {
    const to = params.to.trim().toLowerCase();

    await this.sendEmail({
      to,
      subject: 'Reset your FlowSync password',
      html: buildPasswordResetEmailHtml({
        fullName: params.fullName,
        resetUrl: params.resetUrl,
        expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
      }),
      failureMessage: 'Unable to send password reset email. Please try again.',
    });
  }

  private getSmtpPassword() {
    const pass =
      this.configService.get<string>('SMTP_PASSWORD') ??
      this.configService.get<string>('SMTP_PASS');

    return pass?.replace(/\s/g, '') ?? '';
  }

  private async sendEmail(params: {
    to: string;
    subject: string;
    html: string;
    failureMessage: string;
  }) {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to: params.to,
        subject: params.subject,
        html: params.html,
      });
    } catch (error) {
      this.logger.error(`Failed to send email to ${params.to}`, error);
      throw new ServiceUnavailableException(params.failureMessage);
    }
  }
}
