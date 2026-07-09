import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailService } from '../../email/email.service';
import {
  EMAIL_JOB_SEND,
  EMAIL_QUEUE,
  type EmailSendJobData,
} from '../queue.constants';

@Processor(EMAIL_QUEUE)
@Injectable()
export class EmailQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailQueueProcessor.name);

  constructor(private readonly emailService: EmailService) {
    super();
  }

  async process(job: Job<EmailSendJobData, void>): Promise<void> {
    if (job.name !== EMAIL_JOB_SEND) {
      throw new Error(`Unknown email job: ${job.name}`);
    }

    this.logger.debug(`Processing email job ${job.id} → ${job.data.to}`);
    await this.emailService.deliverEmail(job.data);
  }
}
