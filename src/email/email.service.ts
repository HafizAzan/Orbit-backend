import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { EmailQueueService } from '../queues/email-queue.service';
import { buildRegisterOtpEmailHtml } from './templates/register-otp.template';
import { buildPasswordResetEmailHtml } from './templates/password-reset.template';
import { buildTeamInviteEmailHtml } from './templates/team-invite.template';
import { buildEmailChangeRequestEmailHtml } from './templates/email-change-request.template';
import {
  buildDailyDigestEmailHtml,
  buildWeeklyReportEmailHtml,
} from './templates/workspace-digest.template';

const OTP_TTL_MINUTES = 10;
const PASSWORD_RESET_TTL_MINUTES = 60;

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly emailQueueService: EmailQueueService,
  ) {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = Number(this.configService.get<string>('SMTP_PORT', '587'));
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.getSmtpPassword();

    if (!host || !user || !pass) {
      throw new Error('SMTP_HOST, SMTP_USER, and SMTP_PASSWORD are required.');
    }

    this.from = this.configService.get<string>(
      'EMAIL_FROM',
      `Orbit <${user}>`,
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
      subject: 'Your Orbit verification code',
      html: buildRegisterOtpEmailHtml({
        fullName: params.fullName,
        otp: params.otp,
        expiresInMinutes: OTP_TTL_MINUTES,
      }),
      failureMessage: 'Unable to send verification email. Please try again.',
    });
  }

  async sendEmailChangeOtpEmail(params: {
    to: string;
    fullName: string;
    otp: string;
  }): Promise<void> {
    const to = params.to.trim().toLowerCase();

    await this.sendEmail({
      to,
      subject: 'Confirm your new Orbit email address',
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
      subject: 'Reset your Orbit password',
      html: buildPasswordResetEmailHtml({
        fullName: params.fullName,
        resetUrl: params.resetUrl,
        expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
      }),
      failureMessage: 'Unable to send password reset email. Please try again.',
    });
  }

  async sendTeamInviteEmail(params: {
    to: string;
    fullName: string;
    organizationName: string;
    inviterName: string;
    roleLabel: string;
    inviteUrl: string;
    message?: string;
  }): Promise<void> {
    const to = params.to.trim().toLowerCase();

    await this.sendEmail({
      to,
      subject: `You're invited to join ${params.organizationName} on Orbit`,
      html: buildTeamInviteEmailHtml({
        fullName: params.fullName,
        organizationName: params.organizationName,
        inviterName: params.inviterName,
        roleLabel: params.roleLabel,
        inviteUrl: params.inviteUrl,
        message: params.message,
        expiresInDays: 7,
      }),
      failureMessage: 'Unable to send team invitation email. Please try again.',
    });
  }

  async sendEmailChangeRequestEmail(params: {
    to: string;
    recipientName: string;
    requesterName: string;
    requesterRoleLabel: string;
    organizationName: string;
    subject: string;
    currentEmail: string;
    newEmail: string;
    reason: string;
    settingsUrl: string;
  }): Promise<void> {
    const to = params.to.trim().toLowerCase();

    await this.sendEmail({
      to,
      subject: params.subject.trim(),
      html: buildEmailChangeRequestEmailHtml({
        recipientName: params.recipientName,
        requesterName: params.requesterName,
        requesterRoleLabel: params.requesterRoleLabel,
        organizationName: params.organizationName,
        subject: params.subject.trim(),
        currentEmail: params.currentEmail,
        newEmail: params.newEmail,
        reason: params.reason,
        settingsUrl: params.settingsUrl,
      }),
      failureMessage: 'Unable to send email change request. Please try again.',
    });
  }

  async sendDailyDigestEmail(params: {
    to: string;
    fullName: string;
    workspaceName: string;
    tasksDueToday: number;
    openTasks: number;
    recentActivity: number;
    dashboardUrl: string;
  }): Promise<void> {
    await this.sendEmail({
      to: params.to.trim().toLowerCase(),
      subject: `${params.workspaceName} daily digest`,
      html: buildDailyDigestEmailHtml(params),
      failureMessage: 'Unable to send daily digest email.',
    });
  }

  async sendWeeklyReportEmail(params: {
    to: string;
    fullName: string;
    workspaceName: string;
    completedTasks: number;
    createdTasks: number;
    activeMembers: number;
    reportsUrl: string;
  }): Promise<void> {
    await this.sendEmail({
      to: params.to.trim().toLowerCase(),
      subject: `${params.workspaceName} weekly report`,
      html: buildWeeklyReportEmailHtml(params),
      failureMessage: 'Unable to send weekly report email.',
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
    if (this.emailQueueService.isEnabled()) {
      await this.emailQueueService.sendEmail(params);
      return;
    }

    await this.deliverEmail(params);
  }

  /** Worker-only: SMTP send without re-queue. */
  async deliverEmail(params: {
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
