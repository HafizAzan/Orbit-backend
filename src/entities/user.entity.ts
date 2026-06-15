import {
  AccountStatus,
  AuthProvider,
  EmailVerificationStatus,
  RegisterAs,
  SignupSource,
} from '../enum/auth.enum';

import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Organization } from './organization.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'full_name', length: 120 })
  fullName: string;

  @Column({ length: 255, unique: true })
  email: string;

  @Column({
    name: 'password_hash',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  passwordHash: string | null;

  @Column({
    name: 'auth_provider',
    type: 'enum',
    enum: AuthProvider,
    default: AuthProvider.EMAIL,
  })
  authProvider: AuthProvider;

  @Column({
    name: 'signup_source',
    type: 'enum',
    enum: SignupSource,
    default: SignupSource.DIRECT,
  })
  signupSource: SignupSource;

  @Column({
    type: 'enum',
    enum: RegisterAs,
    default: RegisterAs.MEMBER,
  })
  role: RegisterAs;

  @Column({
    name: 'email_verification_status',
    type: 'enum',
    enum: EmailVerificationStatus,
    default: EmailVerificationStatus.PENDING,
  })
  emailVerificationStatus: EmailVerificationStatus;

  @Column({
    name: 'account_status',
    type: 'enum',
    enum: AccountStatus,
    default: AccountStatus.PENDING,
  })
  accountStatus: AccountStatus;

  @Column({ name: 'is_platform_admin', default: false })
  isPlatformAdmin: boolean;

  @Column({ name: 'organization_id', type: 'uuid', nullable: true })
  organizationId: string | null;

  @ManyToOne(() => Organization, (organization) => organization.users, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'organization_id' })
  organization: Organization | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
