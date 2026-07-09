import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Agent, CursorAgentError } from '@cursor/sdk';
import type { SDKMessage } from '@cursor/sdk';
import { AiQueueService } from '../../queues/ai-queue.service';

@Injectable()
export class CursorProvider {
  private readonly logger = new Logger(CursorProvider.name);
  private readonly apiKey: string;
  private readonly modelId: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly aiQueueService: AiQueueService,
  ) {
    const apiKey = this.configService.get<string>('CURSOR_API_KEY');

    if (!apiKey) {
      throw new Error('CURSOR_API_KEY is not configured.');
    }

    this.apiKey = apiKey;
    this.modelId =
      this.configService.get<string>('CURSOR_MODEL') ?? 'composer-2.5';
  }

  /** Public entry: queue when Redis/BullMQ is on, otherwise run inline. */
  async generateText(prompt: string): Promise<string> {
    if (this.aiQueueService.isEnabled()) {
      return this.aiQueueService.generateText(prompt);
    }

    return this.generateTextNow(prompt);
  }

  /** Worker-only: run Cursor SDK directly (no re-queue). */
  async generateTextNow(prompt: string): Promise<string> {
    try {
      const firstPass = await this.runPrompt(
        [
          'You are a JSON API. Your entire reply must be a single JSON object.',
          'Do not create files, run tools, or write markdown.',
          'Do not wrap the JSON in code fences.',
          'Do not add any text before or after the JSON.',
          '',
          prompt,
        ].join('\n'),
      );

      if (this.looksLikeJson(firstPass)) {
        return firstPass;
      }

      this.logger.warn(
        `Cursor first pass was not JSON (len=${firstPass.length}). Retrying.`,
      );

      const retryPass = await this.runPrompt(
        [
          'Your previous answer was rejected because it was not valid JSON.',
          'Reply again with ONLY one JSON object matching the schema in the request.',
          'No markdown, no plan, no explanation, no code fences.',
          '',
          prompt,
        ].join('\n'),
      );

      return retryPass;
    } catch (error) {
      if (error instanceof ServiceUnavailableException) {
        throw error;
      }

      if (error instanceof CursorAgentError) {
        throw new ServiceUnavailableException(
          `Cursor request failed: ${error.message}`,
        );
      }

      const message =
        error instanceof Error ? error.message : 'Unknown Cursor provider error.';

      throw new ServiceUnavailableException(`Cursor request failed: ${message}`);
    }
  }

  private async runPrompt(message: string): Promise<string> {
    await using agent = await Agent.create({
      apiKey: this.apiKey,
      model: { id: this.modelId },
      mode: 'plan',
      local: {
        cwd: process.cwd(),
        settingSources: [],
      },
    });

    const run = await agent.send(message);
    const streamedText = await this.collectAssistantText(run.stream());
    const result = await run.wait();

    if (result.status === 'error') {
      throw new ServiceUnavailableException(
        `Cursor agent failed: ${result.error?.message ?? 'unknown error'}`,
      );
    }

    const text = (streamedText || result.result || '').trim();

    if (!text) {
      throw new ServiceUnavailableException(
        'Cursor returned an empty response.',
      );
    }

    return text;
  }

  private async collectAssistantText(
    stream: AsyncGenerator<SDKMessage, void>,
  ): Promise<string> {
    const chunks: string[] = [];

    for await (const event of stream) {
      if (event.type !== 'assistant') {
        continue;
      }

      for (const block of event.message.content) {
        if (block.type === 'text' && block.text) {
          chunks.push(block.text);
        }
      }
    }

    return chunks.join('').trim();
  }

  private looksLikeJson(text: string): boolean {
    const trimmed = text.trim();

    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return true;
    }

    if (/```(?:json)?/i.test(trimmed) && trimmed.includes('{')) {
      return true;
    }

    return trimmed.includes('{') && trimmed.includes('}');
  }
}
