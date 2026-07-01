import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NotificationKind } from '../enum/notification.enum';
import { User } from './user.entity';

@Entity('notifications')
@Index(['userId', 'read', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({
    type: 'enum',
    enum: NotificationKind,
    default: NotificationKind.PROJECT,
  })
  kind: NotificationKind;

  @Column({ length: 160 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  href: string | null;

  @Column({ type: 'boolean', default: false })
  read: boolean;

  @Column({ name: 'resource_type', type: 'varchar', length: 64, nullable: true })
  resourceType: string | null;

  @Column({ name: 'resource_id', type: 'uuid', nullable: true })
  resourceId: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
