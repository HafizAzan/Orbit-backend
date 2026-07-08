import {
  AccountStatus,
  AuthProvider,
  EmailVerificationStatus,
  RegisterAs,
  SignupSource,
} from '../enum/auth.enum';
import { MemberDepartment } from '../enum/member.enum';
import { AppUiTheme } from '../enum/app-ui-theme.enum';

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

  @Column({
    type: 'enum',
    enum: MemberDepartment,
    default: MemberDepartment.ENGINEERING,
    nullable: true,
  })
  department: MemberDepartment | null;

  @Column({ name: 'invite_token', type: 'varchar', length: 64, nullable: true })
  inviteToken: string | null;

  @Column({ name: 'invite_expires_at', type: 'timestamptz', nullable: true })
  inviteExpiresAt: Date | null;

  @Column({ name: 'invited_by_id', type: 'uuid', nullable: true })
  invitedById: string | null;

  @Column({ name: 'last_active_at', type: 'timestamptz', nullable: true })
  lastActiveAt: Date | null;

  @Column({ name: 'token_version', type: 'integer', default: 0 })
  tokenVersion: number;

  @Column({
    name: 'two_factor_challenge_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  twoFactorChallengeId: string | null;

  @Column({ name: 'two_factor_enabled', default: false })
  twoFactorEnabled: boolean;

  @Column({
    name: 'two_factor_secret',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  twoFactorSecret: string | null;

  @Column({
    name: 'ui_theme',
    type: 'enum',
    enum: AppUiTheme,
    default: AppUiTheme.CLASSIC,
  })
  uiTheme: AppUiTheme;

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
