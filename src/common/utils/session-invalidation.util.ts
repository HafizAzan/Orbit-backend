import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { AccountStatus, RegisterAs } from '../../enum/auth.enum';

export async function ensureNotLastActiveAdmin(
  userRepository: Repository<User>,
  organizationId: string,
  member: Pick<User, 'role'>,
) {
  if (member.role !== RegisterAs.ADMIN) {
    return;
  }

  const activeAdminCount = await userRepository.count({
    where: {
      organizationId,
      role: RegisterAs.ADMIN,
      accountStatus: AccountStatus.ACTIVE,
    },
  });

  if (activeAdminCount <= 1) {
    throw new BadRequestException(
      'At least one workspace admin must remain active.',
    );
  }
}

export async function invalidateUserSessions(
  userRepository: Repository<User>,
  userId: string,
) {
  await userRepository.increment({ id: userId }, 'tokenVersion', 1);
  await userRepository.update(userId, { twoFactorChallengeId: null });
}
