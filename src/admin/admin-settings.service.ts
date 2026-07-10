import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DEFAULT_PLATFORM_SETTINGS,
  PlatformSettings,
  type PlatformSettingsPayload,
} from '../entities/platform-settings.entity';
import { UpdatePlatformSettingsDto } from './dto/admin-settings.dto';
import { buildBrandingAssetUrl } from '../common/asset-upload.storage';

@Injectable()
export class AdminSettingsService {
  constructor(
    @InjectRepository(PlatformSettings)
    private readonly settingsRepository: Repository<PlatformSettings>,
  ) {}

  async getSettings(): Promise<PlatformSettingsPayload> {
    const row = await this.ensureRow();
    return this.mergeDefaults(row.settings);
  }

  async updateSettings(
    dto: UpdatePlatformSettingsDto,
  ): Promise<PlatformSettingsPayload> {
    const row = await this.ensureRow();
    row.settings = this.mergeDefaults({
      ...row.settings,
      ...Object.fromEntries(
        Object.entries(dto).filter(([, value]) => value !== undefined),
      ),
    } as PlatformSettingsPayload);
    await this.settingsRepository.save(row);
    return row.settings;
  }

  async uploadBrandingAsset(
    kind: 'logo' | 'favicon',
    file: Express.Multer.File,
  ): Promise<PlatformSettingsPayload> {
    const url = buildBrandingAssetUrl(file.filename);
    return this.updateSettings(
      kind === 'logo' ? { logoUrl: url } : { faviconUrl: url },
    );
  }

  private mergeDefaults(
    settings: Partial<PlatformSettingsPayload>,
  ): PlatformSettingsPayload {
    return {
      ...DEFAULT_PLATFORM_SETTINGS,
      ...settings,
      logoUrl: settings.logoUrl ?? DEFAULT_PLATFORM_SETTINGS.logoUrl,
      faviconUrl: settings.faviconUrl ?? DEFAULT_PLATFORM_SETTINGS.faviconUrl,
    };
  }

  private async ensureRow() {
    const existing = await this.settingsRepository.find({ take: 1 });
    if (existing[0]) {
      existing[0].settings = this.mergeDefaults(existing[0].settings);
      return existing[0];
    }

    return this.settingsRepository.save(
      this.settingsRepository.create({
        settings: { ...DEFAULT_PLATFORM_SETTINGS },
      }),
    );
  }
}
