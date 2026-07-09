import { Injectable, Logger, Optional } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DigestQueueService } from '../queues/digest-queue.service';
import { NotificationDigestService } from './notification-digest.service';

@Injectable()
export class NotificationDigestJob {
  private readonly logger = new Logger(NotificationDigestJob.name);

  constructor(
    private readonly notificationDigestService: NotificationDigestService,
    @Optional() private readonly digestQueueService?: DigestQueueService,
  ) {}

  @Cron('0 8 * * *')
  async runDailyDigest() {
    if (this.digestQueueService?.isEnabled()) {
      this.logger.log('Enqueueing daily workspace digest job');
      await this.digestQueueService.enqueueDailyDigest();
      return;
    }

    this.logger.log('Running daily workspace digest job inline');
    await this.notificationDigestService.sendDailyDigests();
  }

  @Cron('0 9 * * 1')
  async runWeeklyReport() {
    if (this.digestQueueService?.isEnabled()) {
      this.logger.log('Enqueueing weekly workspace report job');
      await this.digestQueueService.enqueueWeeklyReport();
      return;
    }

    this.logger.log('Running weekly workspace report job inline');
    await this.notificationDigestService.sendWeeklyReports();
  }
}
