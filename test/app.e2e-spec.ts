import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';

describe('Health (e2e smoke)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: AppService,
          useValue: {
            getHealth: async () => ({
              status: 'ok',
              service: 'orbit-api',
              timestamp: new Date().toISOString(),
              checks: [
                { name: 'database', status: 'up', latencyMs: 1 },
                { name: 'stripe_config', status: 'up', detail: 'Configured' },
                { name: 'queue', status: 'up', detail: 'Queue disabled' },
              ],
            }),
          },
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/v1/health returns infrastructure checks', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('orbit-api');
    expect(Array.isArray(response.body.checks)).toBe(true);
    expect(response.body.checks.length).toBeGreaterThan(0);
  });
});
