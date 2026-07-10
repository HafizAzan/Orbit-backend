import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type PlatformSettingsPayload = {
  platformName: string;
  defaultLanguage: string;
  timezone: string;
  brandColor: string;
  logoUrl: string;
  faviconUrl: string;
  smtpHost: string;
  smtpPort: string;
  smtpUsername: string;
  smtpPassword: string;
  enforce2fa: boolean;
  highPasswordComplexity: boolean;
  autoSessionTimeout: boolean;
  emailNotifications: boolean;
  weeklyDigest: boolean;
  slackWebhook: string;
  stripeEnabled: boolean;
  sendgridEnabled: boolean;
  webhookUrl: string;
  defaultCurrency: string;
  taxId: string;
  invoicePrefix: string;
};

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettingsPayload = {
  platformName: 'Orbit',
  defaultLanguage: 'en-US',
  timezone: 'America/Los_Angeles',
  brandColor: '#4F46E5',
  logoUrl: '',
  faviconUrl: '',
  smtpHost: 'smtp.sendgrid.net',
  smtpPort: '587',
  smtpUsername: 'apikey',
  smtpPassword: '',
  enforce2fa: true,
  highPasswordComplexity: true,
  autoSessionTimeout: false,
  emailNotifications: true,
  weeklyDigest: true,
  slackWebhook: '',
  stripeEnabled: true,
  sendgridEnabled: true,
  webhookUrl: 'https://api.orbit.io/webhooks/platform',
  defaultCurrency: 'USD',
  taxId: '',
  invoicePrefix: 'OR-',
};

@Entity('platform_settings')
export class PlatformSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'jsonb' })
  settings: PlatformSettingsPayload;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
