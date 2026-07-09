import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';
import {
  EMAIL_JOB_SEND,
  EMAIL_QUEUE,
  type EmailSendJobData,
} from './queue.constants';

const EMAIL_JOB_TIMEOUT_MS = 60_000;

@Injectable()
export class EmailQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(EmailQueueService.name);
  private readonly queueEvents: QueueEvents | null = null;

  constructor(
    private readonly queueEnabled: boolean,
    private readonly emailQueue?: Queue<EmailSendJobData, void>,
  ) {
    if (this.queueEnabled && this.emailQueue) {
      this.queueEvents = new QueueEvents(EMAIL_QUEUE, {
        connection: this.emailQueue.opts.connection,
      });
    }
  }

  async onModuleDestroy() {
    await this.queueEvents?.close();
  }

  isEnabled() {
    return (
      this.queueEnabled && Boolean(this.emailQueue) && Boolean(this.queueEvents)
    );
  }

  async sendEmail(data: EmailSendJobData): Promise<void> {
    if (!this.isEnabled() || !this.emailQueue || !this.queueEvents) {
      throw new Error('Email queue is not enabled.');
    }

    const job = await this.emailQueue.add(EMAIL_JOB_SEND, data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
      removeOnComplete: 100,
      removeOnFail: 200,
    });

    this.logger.debug(`Queued email job ${job.id} → ${data.to}`);

    await job.waitUntilFinished(this.queueEvents, EMAIL_JOB_TIMEOUT_MS);
  }
}
