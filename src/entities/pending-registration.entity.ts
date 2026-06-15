import {
  AuthProvider,
  RegisterAs,
  SignupSource,
} from '../enum/auth.enum';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('pending_registrations')
export class PendingRegistration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 255, unique: true })
  email: string;

  @Column({ name: 'full_name', length: 120 })
  fullName: string;

  @Column({ name: 'organization_name', length: 120 })
  organizationName: string;

  @Column({ name: 'organization_slug', length: 120, unique: true })
  organizationSlug: string;

  @Column({ name: 'password_hash', length: 255 })
  passwordHash: string;

  @Column({
    name: 'auth_provider',
    type: 'enum',
    enum: AuthProvider,
  })
  authProvider: AuthProvider;

  @Column({
    name: 'signup_source',
    type: 'enum',
    enum: SignupSource,
  })
  signupSource: SignupSource;

  @Column({
    type: 'enum',
    enum: RegisterAs,
  })
  role: RegisterAs;

  @Column({ name: 'otp_hash', length: 255 })
  otpHash: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
