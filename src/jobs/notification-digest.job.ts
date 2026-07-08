import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationDigestService } from './notification-digest.service';

@Injectable()
export class NotificationDigestJob {
  private readonly logger = new Logger(NotificationDigestJob.name);

  constructor(
    private readonly notificationDigestService: NotificationDigestService,
  ) {}

  @Cron('0 8 * * *')
  async runDailyDigest() {
    this.logger.log('Running daily workspace digest job');
    await this.notificationDigestService.sendDailyDigests();
  }

  @Cron('0 9 * * 1')
  async runWeeklyReport() {
    this.logger.log('Running weekly workspace report job');
    await this.notificationDigestService.sendWeeklyReports();
  }
}
