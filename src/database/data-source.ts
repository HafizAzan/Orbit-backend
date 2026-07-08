import { resolve } from 'node:path';
import { DataSource, type DataSourceOptions } from 'typeorm';
import {
  getTypeOrmModuleOptions,
  parseDatabaseConfig,
} from '../config/database';
import { Organization } from '../entities/organization.entity';
import { PasswordReset } from '../entities/password-reset.entity';
import { PendingRegistration } from '../entities/pending-registration.entity';
import { Subscription } from '../entities/subscription.entity';
import { User } from '../entities/user.entity';

function loadEnvFiles() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { config } = require('dotenv') as typeof import('dotenv');

  config({ path: resolve(process.cwd(), '.env.local') });
  config({ path: resolve(process.cwd(), '.env') });
}

export function createSeedDataSource(): DataSource {
  loadEnvFiles();

  const dbConfig = parseDatabaseConfig();
  const baseOptions = getTypeOrmModuleOptions(dbConfig) as DataSourceOptions;

  return new DataSource({
    ...baseOptions,
    entities: [
      User,
      Organization,
      Subscription,
      PendingRegistration,
      PasswordReset,
    ],
  });
}
