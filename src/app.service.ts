import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type HealthCheckItem = {
  name: string;
  status: 'up' | 'down';
  latencyMs?: number;
  detail?: string;
};

export type HealthResponse = {
  status: 'ok' | 'degraded';
  service: string;
  timestamp: string;
  checks: HealthCheckItem[];
};

@Injectable()
export class AppService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async getHealth(): Promise<HealthResponse> {
    const checks: HealthCheckItem[] = [];

    const dbStart = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      checks.push({
        name: 'database',
        status: 'up',
        latencyMs: Date.now() - dbStart,
      });
    } catch (error) {
      checks.push({
        name: 'database',
        status: 'down',
        latencyMs: Date.now() - dbStart,
        detail: error instanceof Error ? error.message : 'Database unreachable',
      });
    }

    const stripeKey = this.configService.get<string>('STRIPE_SECRET_KEY');
    checks.push({
      name: 'stripe_config',
      status: stripeKey ? 'up' : 'down',
      detail: stripeKey ? 'Configured' : 'STRIPE_SECRET_KEY missing',
    });

    const redisUrl = this.configService.get<string>('REDIS_URL');
    const queueEnabled =
      String(this.configService.get('QUEUE_ENABLED') ?? 'false').toLowerCase() ===
      'true';
    if (queueEnabled) {
      checks.push({
        name: 'queue',
        status: redisUrl ? 'up' : 'down',
        detail: redisUrl ? 'Queue enabled with Redis URL' : 'QUEUE_ENABLED without REDIS_URL',
      });
    } else {
      checks.push({
        name: 'queue',
        status: 'up',
        detail: 'Queue disabled',
      });
    }

    const degraded = checks.some((check) => check.status === 'down');

    return {
      status: degraded ? 'degraded' : 'ok',
      service: 'orbit-api',
      timestamp: new Date().toISOString(),
      checks,
    };
  }
}
