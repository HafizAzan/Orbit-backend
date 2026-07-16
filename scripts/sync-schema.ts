/**
 * One-off: create/update all tables on the DB from .env.local
 * Usage: npx ts-node -r tsconfig-paths/register scripts/sync-schema.ts
 */
import { resolve } from 'node:path';
import { DataSource } from 'typeorm';
import { parseDatabaseConfig } from '../src/config/database';

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config({ path: resolve(process.cwd(), '.env.local') });

async function main() {
  const config = parseDatabaseConfig();
  const dataSource = new DataSource({
    type: 'postgres',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    entities: [resolve(__dirname, '../src/entities/**/*.entity.ts')],
    synchronize: true,
  });

  console.log(
    `Syncing schema → ${config.host}:${config.port}/${config.database} (ssl=${config.ssl})`,
  );
  await dataSource.initialize();
  console.log('Schema sync complete.');
  await dataSource.destroy();
}

main().catch((error) => {
  console.error('Schema sync failed:', error);
  process.exit(1);
});
