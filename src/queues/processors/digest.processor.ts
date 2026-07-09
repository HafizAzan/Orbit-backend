import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationDigestService } from '../../jobs/notification-digest.service';
import {
  DIGEST_JOB_DAILY,
  DIGEST_JOB_WEEKLY,
  DIGEST_QUEUE,
  type DigestJobData,
} from '../queue.constants';

@Processor(DIGEST_QUEUE)
@Injectable()
export class DigestQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(DigestQueueProcessor.name);

  constructor(
    private readonly notificationDigestService: NotificationDigestService,
  ) {
    super();
  }

  async process(job: Job<DigestJobData, void>): Promise<void> {
    if (job.name === DIGEST_JOB_DAILY) {
      this.logger.log(`Processing daily digest job ${job.id}`);
      await this.notificationDigestService.sendDailyDigests();
      return;
    }

    if (job.name === DIGEST_JOB_WEEKLY) {
      this.logger.log(`Processing weekly report job ${job.id}`);
      await this.notificationDigestService.sendWeeklyReports();
      return;
    }

    throw new Error(`Unknown digest job: ${job.name}`);
  }
}
