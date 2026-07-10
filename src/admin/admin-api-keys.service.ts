import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { PlatformApiKey } from '../entities/platform-api-key.entity';
import {
  CreatePlatformApiKeyDto,
  UpdatePlatformApiKeyDto,
} from './dto/admin-api-keys.dto';

@Injectable()
export class AdminApiKeysService {
  constructor(
    @InjectRepository(PlatformApiKey)
    private readonly apiKeyRepository: Repository<PlatformApiKey>,
  ) {}

  async list() {
    const keys = await this.apiKeyRepository.find({
      where: { revokedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });

    return {
      data: keys.map((key) => this.mapKey(key)),
    };
  }

  async create(dto: CreatePlatformApiKeyDto) {
    const rawKey = `orb_live_${randomBytes(24).toString('hex')}`;
    const keyHash = this.hashKey(rawKey);
    const keyHint = `${rawKey.slice(0, 10)}...${rawKey.slice(-4)}`;

    const saved = await this.apiKeyRepository.save(
      this.apiKeyRepository.create({
        label: dto.label.trim(),
        keyHash,
        keyHint,
      }),
    );

    return {
      ...this.mapKey(saved),
      secret: rawKey,
      message: 'API key created. Copy it now — it will not be shown again.',
    };
  }

  async update(id: string, dto: UpdatePlatformApiKeyDto) {
    const key = await this.findActive(id);
    if (dto.label?.trim()) {
      key.label = dto.label.trim();
    }
    await this.apiKeyRepository.save(key);
    return this.mapKey(key);
  }

  async revoke(id: string) {
    const key = await this.findActive(id);
    key.revokedAt = new Date();
    await this.apiKeyRepository.save(key);
    return { message: 'API key revoked.', id: key.id };
  }

  private async findActive(id: string) {
    const key = await this.apiKeyRepository.findOne({
      where: { id, revokedAt: IsNull() },
    });
    if (!key) {
      throw new NotFoundException('API key not found.');
    }
    return key;
  }

  private hashKey(rawKey: string) {
    return createHash('sha256').update(rawKey).digest('hex');
  }

  private mapKey(key: PlatformApiKey) {
    return {
      id: key.id,
      label: key.label,
      keyHint: key.keyHint,
      createdAt: key.createdAt.toISOString(),
      lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    };
  }
}
