import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

/**
 * Load env before Nest modules evaluate QUEUE_ENABLED feature flags.
 * Must be imported first from main.ts.
 */
const cwd = process.cwd();
for (const file of ['.env.local', '.env']) {
  const path = resolve(cwd, file);
  if (existsSync(path)) {
    config({ path, override: false });
  }
}
