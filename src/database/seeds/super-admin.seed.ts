import * as argon2 from 'argon2';
import type { DataSource } from 'typeorm';
import { User } from '../../entities/user.entity';
import {
  AccountStatus,
  AuthProvider,
  EmailVerificationStatus,
  RegisterAs,
  SignupSource,
} from '../../enum/auth.enum';

const DEFAULT_SUPER_ADMIN_EMAIL = 'admin09068@yopmail.com';
const DEFAULT_SUPER_ADMIN_NAME = 'FlowSync Super Admin';

export async function seedSuperAdmin(dataSource: DataSource) {
  const userRepository = dataSource.getRepository(User);
  const email = (process.env.SUPER_ADMIN_EMAIL ?? DEFAULT_SUPER_ADMIN_EMAIL)
    .trim()
    .toLowerCase();
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!password) {
    throw new Error(
      'SUPER_ADMIN_PASSWORD is required in .env.local before running the seed.',
    );
  }

  const passwordHash = await argon2.hash(password);
  const existingUser = await userRepository.findOne({ where: { email } });

  if (existingUser) {
    await userRepository.update(existingUser.id, {
      fullName: existingUser.fullName || DEFAULT_SUPER_ADMIN_NAME,
      role: RegisterAs.SUPER_ADMIN,
      isPlatformAdmin: true,
      organizationId: null,
      authProvider: AuthProvider.EMAIL,
      signupSource: SignupSource.DIRECT,
      emailVerificationStatus: EmailVerificationStatus.VERIFIED,
      accountStatus: AccountStatus.ACTIVE,
      passwordHash,
    });

    return {
      action: 'updated' as const,
      email,
    };
  }

  await userRepository.save(
    userRepository.create({
      fullName: DEFAULT_SUPER_ADMIN_NAME,
      email,
      passwordHash,
      authProvider: AuthProvider.EMAIL,
      signupSource: SignupSource.DIRECT,
      role: RegisterAs.SUPER_ADMIN,
      isPlatformAdmin: true,
      organizationId: null,
      emailVerificationStatus: EmailVerificationStatus.VERIFIED,
      accountStatus: AccountStatus.ACTIVE,
    }),
  );

  return {
    action: 'created' as const,
    email,
  };
}
