import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import databaseConfig, {
  DATABASE_CONFIG_KEY,
  type DatabaseConfig,
  getTypeOrmModuleOptions,
} from './config/database';
import { envValidationSchema } from './config/env.validation';
import { AuthModule } from './auth/auth.module';

// module decorator
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [databaseConfig],
      validationSchema: envValidationSchema,
    }),

    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const db = configService.get<DatabaseConfig>(DATABASE_CONFIG_KEY);
        if (!db) throw new Error('Database configuration is missing.');
        return getTypeOrmModuleOptions(db);
      },
    }),

    ThrottlerModule?.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),

    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
