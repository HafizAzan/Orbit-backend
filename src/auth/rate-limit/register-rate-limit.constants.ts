export const REGISTER_RATE_LIMIT = {
  MAX_ATTEMPTS: 5,
  BLOCK_DURATION_MS: 12 * 60 * 60 * 1000,
  WINDOW_MS: 24 * 60 * 60 * 1000,
} as const;
