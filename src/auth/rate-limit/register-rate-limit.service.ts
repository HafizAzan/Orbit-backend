import { Injectable } from '@nestjs/common';
import { REGISTER_RATE_LIMIT } from './register-rate-limit.constants';

type IpRecord = {
  attempts: number[];
  blockedUntil: number | null;
};

@Injectable()
export class RegisterRateLimitService {
  private readonly store = new Map<string, IpRecord>();

  check(ip: string): { allowed: boolean; retryAfter?: Date } {
    const now = Date.now();
    const record = this.getOrCreate(ip);

    if (record.blockedUntil && record.blockedUntil > now) {
      return { allowed: false, retryAfter: new Date(record.blockedUntil) };
    }

    if (record.blockedUntil && record.blockedUntil <= now) {
      this.reset(ip);
    }

    const recentAttempts = this.getRecentAttempts(ip, now);

    if (recentAttempts.length >= REGISTER_RATE_LIMIT.MAX_ATTEMPTS) {
      const blockedUntil = now + REGISTER_RATE_LIMIT.BLOCK_DURATION_MS;
      this.store.set(ip, {
        attempts: recentAttempts,
        blockedUntil,
      });

      return { allowed: false, retryAfter: new Date(blockedUntil) };
    }

    return { allowed: true };
  }

  recordAttempt(ip: string): void {
    const now = Date.now();
    const record = this.getOrCreate(ip);
    const recentAttempts = this.getRecentAttempts(ip, now);

    recentAttempts.push(now);

    this.store.set(ip, {
      attempts: recentAttempts,
      blockedUntil: record.blockedUntil,
    });
  }

  private getOrCreate(ip: string): IpRecord {
    return this.store.get(ip) ?? { attempts: [], blockedUntil: null };
  }

  private getRecentAttempts(ip: string, now: number): number[] {
    const record = this.getOrCreate(ip);
    const windowStart = now - REGISTER_RATE_LIMIT.WINDOW_MS;

    return record.attempts.filter((timestamp) => timestamp >= windowStart);
  }

  private reset(ip: string): void {
    this.store.set(ip, { attempts: [], blockedUntil: null });
  }
}
