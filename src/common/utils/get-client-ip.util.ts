import type { Request } from 'express';

export function getClientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];

  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }

  return request.ip ?? 'unknown';
}
