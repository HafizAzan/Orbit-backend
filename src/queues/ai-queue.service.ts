import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue, QueueEvents } from 'bullmq';
import {
  AI_JOB_GENERATE_TEXT,
  AI_QUEUE,
  type AiGenerateTextJobData,
  type AiGenerateTextJobResult,
} from './queue.constants';

const AI_JOB_TIMEOUT_MS = 180_000;

@Injectable()
export class AiQueueService implements OnModuleDestroy {
  private readonly logger = new Logger(AiQueueService.name);
  private readonly queueEvents: QueueEvents | null = null;

  constructor(
    private readonly queueEnabled: boolean,
    private readonly aiQueue?: Queue<
      AiGenerateTextJobData,
      AiGenerateTextJobResult
    >,
  ) {
    if (this.queueEnabled && this.aiQueue) {
      this.queueEvents = new QueueEvents(AI_QUEUE, {
        connection: this.aiQueue.opts.connection,
      });
    }
  }

  async onModuleDestroy() {
    await this.queueEvents?.close();
  }

  isEnabled() {
    return this.queueEnabled && Boolean(this.aiQueue) && Boolean(this.queueEvents);
  }

  async generateText(prompt: string): Promise<string> {
    if (!this.isEnabled() || !this.aiQueue || !this.queueEvents) {
      throw new Error('AI queue is not enabled.');
    }

    const job = await this.aiQueue.add(
      AI_JOB_GENERATE_TEXT,
      { prompt },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    );

    this.logger.debug(`Queued AI job ${job.id}`);

    const result = await job.waitUntilFinished(
      this.queueEvents,
      AI_JOB_TIMEOUT_MS,
    );

    return result.text;
  }
}
