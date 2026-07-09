import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  DIGEST_JOB_DAILY,
  DIGEST_JOB_WEEKLY,
  type DigestJobData,
} from './queue.constants';

@Injectable()
export class DigestQueueService {
  private readonly logger = new Logger(DigestQueueService.name);

  constructor(
    private readonly queueEnabled: boolean,
    private readonly digestQueue?: Queue<DigestJobData, void>,
  ) {}

  isEnabled() {
    return this.queueEnabled && Boolean(this.digestQueue);
  }

  async enqueueDailyDigest(): Promise<void> {
    if (!this.isEnabled() || !this.digestQueue) {
      throw new Error('Digest queue is not enabled.');
    }

    const job = await this.digestQueue.add(
      DIGEST_JOB_DAILY,
      {},
      {
        jobId: `daily-digest-${new Date().toISOString().slice(0, 10)}`,
        removeOnComplete: 20,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Queued daily digest job ${job.id}`);
  }

  async enqueueWeeklyReport(): Promise<void> {
    if (!this.isEnabled() || !this.digestQueue) {
      throw new Error('Digest queue is not enabled.');
    }

    const week = getIsoWeekKey(new Date());
    const job = await this.digestQueue.add(
      DIGEST_JOB_WEEKLY,
      {},
      {
        jobId: `weekly-report-${week}`,
        removeOnComplete: 20,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Queued weekly report job ${job.id}`);
  }
}

function getIsoWeekKey(date: Date): string {
  const tmp = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(
    ((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
