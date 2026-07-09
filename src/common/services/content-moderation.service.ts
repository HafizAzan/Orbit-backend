import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AccountStatus } from '../../enum/auth.enum';
import { User } from '../../entities/user.entity';
import { invalidateUserSessions } from '../utils/session-invalidation.util';
import { findAbusiveFields } from '../utils/abuse-language.util';

export const ABUSE_WARNING_MESSAGE =
  'Abusive language is not allowed. This is a warning — if you use abusive language again, your account will be deactivated.';

export const ABUSE_DEACTIVATED_MESSAGE =
  'Your account has been deactivated because abusive language was used again after a prior warning.';

@Injectable()
export class ContentModerationService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async assertCleanContent(
    userId: string,
    fields: Record<string, string | null | undefined>,
  ) {
    const abusiveFields = findAbusiveFields(fields);

    if (abusiveFields.length === 0) {
      return;
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    if (user.abuseWarningCount >= 1) {
      user.accountStatus = AccountStatus.SUSPENDED;
      user.abuseWarningCount += 1;
      await this.userRepository.save(user);
      await invalidateUserSessions(this.userRepository, user.id);

      throw new ForbiddenException(ABUSE_DEACTIVATED_MESSAGE);
    }

    user.abuseWarningCount = 1;
    await this.userRepository.save(user);

    throw new ForbiddenException(ABUSE_WARNING_MESSAGE);
  }
}
