import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { CursorProvider } from '../../ai/providers/cursor.provider';
import {
  AI_JOB_GENERATE_TEXT,
  AI_QUEUE,
  type AiGenerateTextJobData,
  type AiGenerateTextJobResult,
} from '../queue.constants';

@Processor(AI_QUEUE)
@Injectable()
export class AiQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(AiQueueProcessor.name);

  constructor(private readonly cursorProvider: CursorProvider) {
    super();
  }

  async process(
    job: Job<AiGenerateTextJobData, AiGenerateTextJobResult>,
  ): Promise<AiGenerateTextJobResult> {
    if (job.name !== AI_JOB_GENERATE_TEXT) {
      throw new Error(`Unknown AI job: ${job.name}`);
    }

    this.logger.debug(`Processing AI job ${job.id}`);
    const text = await this.cursorProvider.generateTextNow(job.data.prompt);
    return { text };
  }
}
