import { Injectable } from '@nestjs/common';

export type HealthResponse = {
  status: 'ok';
  service: string;
  timestamp: string;
};

@Injectable()
export class AppService {
  getHealth(): HealthResponse {
    return {
      status: 'ok',
      service: 'flow-sync-api',
      timestamp: new Date().toISOString(),
    };
  }
}
