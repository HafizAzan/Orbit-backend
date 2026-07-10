import {
  BadRequestException,
  Controller,
  Headers,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { GitHubIntegrationService } from './github-integration.service';

@Controller('webhooks')
export class GitHubWebhookController {
  private readonly logger = new Logger(GitHubWebhookController.name);

  constructor(
    private readonly githubIntegrationService: GitHubIntegrationService,
  ) {}

  @Post('github')
  @SkipThrottle()
  async handleGitHubWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string | undefined,
    @Headers('x-github-event') eventName: string | undefined,
  ) {
    if (!request.rawBody) {
      throw new BadRequestException('Missing raw request body.');
    }

    if (!eventName) {
      throw new BadRequestException('Missing X-GitHub-Event header.');
    }

    try {
      const result = await this.githubIntegrationService.handleWebhook({
        rawBody: request.rawBody,
        signature,
        eventName,
        payload: request.body as Record<string, unknown>,
      });
      return result;
    } catch (error) {
      this.logger.warn(
        `GitHub webhook failed: ${error instanceof Error ? error.message : 'unknown'}`,
      );
      throw error;
    }
  }
}
