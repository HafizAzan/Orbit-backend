import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('platform_api_keys')
export class PlatformApiKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  label: string;

  @Column({ name: 'key_hash', length: 128 })
  keyHash: string;

  @Column({ name: 'key_hint', length: 32 })
  keyHint: string;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
