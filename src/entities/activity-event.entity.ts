import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ActivityAction, ActivityModule } from '../enum/activity.enum';
import { RegisterAs } from '../enum/auth.enum';

@Entity('activity_events')
@Index(['organizationId', 'createdAt'])
@Index(['organizationId', 'actorRole'])
@Index(['organizationId', 'module'])
export class ActivityEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ name: 'actor_id', type: 'uuid' })
  actorId: string;

  @Column({ name: 'actor_name', length: 255 })
  actorName: string;

  @Column({ name: 'actor_role', type: 'enum', enum: RegisterAs })
  actorRole: RegisterAs;

  @Column({ type: 'enum', enum: ActivityModule })
  module: ActivityModule;

  @Column({ type: 'enum', enum: ActivityAction })
  action: ActivityAction;

  @Column({ type: 'varchar', length: 500 })
  summary: string;

  @Column({
    name: 'target_label',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  targetLabel: string | null;

  @Column({
    name: 'resource_type',
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  resourceType: string | null;

  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId: string | null;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
