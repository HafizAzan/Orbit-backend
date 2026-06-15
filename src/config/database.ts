import { registerAs } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const DATABASE_CONFIG_KEY = 'database';

export type DatabaseConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  ssl: boolean;
};

export function parseDatabaseConfig(
  env: NodeJS.ProcessEnv = process.env,
): DatabaseConfig {
  return {
    host: env.DB_HOST ?? '',
    port: Number(env.DB_PORT ?? 5432),
    username: env.DB_USERNAME ?? '',
    password: env.DB_PASSWORD ?? '',
    database: env.DB_NAME ?? '',
    ssl: env.DB_SSL === 'true',
  };
}

export function buildDatabaseUrl(config: DatabaseConfig): string {
  const user = encodeURIComponent(config.username);
  const pass = encodeURIComponent(config.password);
  const query = config.ssl ? '?sslmode=require' : '';

  return `postgresql://${user}:${pass}@${config.host}:${config.port}/${config.database}${query}`;
}

export function getTypeOrmModuleOptions(
  config: DatabaseConfig,
): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    database: config.database,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    autoLoadEntities: true,
    synchronize: process.env.NODE_ENV !== 'production',
  };
}

export default registerAs(
  DATABASE_CONFIG_KEY,
  (): DatabaseConfig => parseDatabaseConfig(),
);
