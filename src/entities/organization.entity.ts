import { OrganizationStatus } from '../enum/billing.enum';
import type { OrganizationWorkspaceSettings } from '../common/types/organization-workspace-settings.type';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Subscription } from './subscription.entity';
import { User } from './user.entity';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 120 })
  name: string;

  @Column({ length: 120, unique: true })
  slug: string;

  @Column({
    type: 'enum',
    enum: OrganizationStatus,
    default: OrganizationStatus.TRIAL,
  })
  status: OrganizationStatus;

  @Column({ name: 'billing_email', type: 'varchar', length: 255, nullable: true })
  billingEmail: string | null;

  @Column({ name: 'workspace_settings', type: 'jsonb', nullable: true })
  workspaceSettings: OrganizationWorkspaceSettings | null;

  @Column({ name: 'two_factor_secret', type: 'varchar', length: 255, nullable: true })
  twoFactorSecret: string | null;

  @Column({ name: 'two_factor_configured', default: false })
  twoFactorConfigured: boolean;

  @Column({ name: 'project_count', type: 'integer', default: 0 })
  projectCount: number;

  @OneToMany(() => User, (user) => user.organization)
  users: User[];

  @OneToOne(() => Subscription, (subscription) => subscription.organization)
  subscription: Subscription | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
