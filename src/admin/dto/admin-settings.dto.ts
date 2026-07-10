import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdatePlatformSettingsDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  platformName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  defaultLanguage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  brandColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  faviconUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpHost?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  smtpPort?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpUsername?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  smtpPassword?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  enforce2fa?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  highPasswordComplexity?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  autoSessionTimeout?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  emailNotifications?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  weeklyDigest?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  slackWebhook?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  stripeEnabled?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  sendgridEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  defaultCurrency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  invoicePrefix?: string;
}
