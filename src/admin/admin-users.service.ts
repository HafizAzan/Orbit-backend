import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import {
  buildPaginatedResponse,
  resolvePagination,
  type PaginatedResponse,
} from '../common/dto/pagination-query.dto';
import {
  buildCountStatMetric,
  buildTotalStatMetric,
} from '../common/utils/billing.util';
import { invalidateUserSessions } from '../common/utils/session-invalidation.util';
import { Organization } from '../entities/organization.entity';
import { User } from '../entities/user.entity';
import { AccountStatus, RegisterAs } from '../enum/auth.enum';
import {
  ListAdminUsersQueryDto,
  UpdateAdminUserDto,
  UpdateAdminUserStatusDto,
} from './dto/admin-users.dto';

export type AdminUserRecord = {
  id: string;
  name: string;
  email: string;
  organization: string;
  organizationId: string | null;
  role: string;
  lastActive: string;
  status: AccountStatus;
};

export type AdminUserStats = {
  total: { value: number; percentage: number };
  active: { value: number; percentage: number };
  pending: { value: number; percentage: number };
  suspended: { value: number; percentage: number };
};

@Injectable()
export class AdminUsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Organization)
    private readonly organizationRepository: Repository<Organization>,
  ) {}

  async findAll(
    query: ListAdminUsersQueryDto = {},
  ): Promise<PaginatedResponse<AdminUserRecord>> {
    const { page, limit, skip, take } = resolvePagination(query);
    const where: Record<string, unknown>[] = [];

    const base: Record<string, unknown> = { isPlatformAdmin: false };
    if (query.status) base.accountStatus = query.status;
    if (query.organizationId) base.organizationId = query.organizationId;

    if (query.search?.trim()) {
      const term = `%${query.search.trim()}%`;
      where.push({ ...base, fullName: ILike(term) });
      where.push({ ...base, email: ILike(term) });
    } else {
      where.push(base);
    }

    const [users, total] = await this.userRepository.findAndCount({
      where,
      relations: { organization: true },
      order: { createdAt: 'DESC' },
      skip,
      take,
    });

    return buildPaginatedResponse(
      users.map((user) => this.mapUser(user)),
      total,
      page,
      limit,
    );
  }

  async findOne(id: string): Promise<AdminUserRecord> {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { organization: true },
    });

    if (!user || user.isPlatformAdmin) {
      throw new NotFoundException('User not found.');
    }

    return this.mapUser(user);
  }

  async getStats(): Promise<AdminUserStats> {
    const users = await this.userRepository.find({
      where: { isPlatformAdmin: false },
    });
    const total = users.length;
    const active = users.filter(
      (user) => user.accountStatus === AccountStatus.ACTIVE,
    ).length;
    const pending = users.filter(
      (user) => user.accountStatus === AccountStatus.PENDING,
    ).length;
    const suspended = users.filter(
      (user) => user.accountStatus === AccountStatus.SUSPENDED,
    ).length;

    return {
      total: buildTotalStatMetric(total),
      active: buildCountStatMetric(active, total),
      pending: buildCountStatMetric(pending, total),
      suspended: buildCountStatMetric(suspended, total),
    };
  }

  async update(id: string, dto: UpdateAdminUserDto) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { organization: true },
    });

    if (!user || user.isPlatformAdmin) {
      throw new NotFoundException('User not found.');
    }

    if (dto.fullName?.trim()) {
      user.fullName = dto.fullName.trim();
    }

    if (dto.role) {
      if (user.role === RegisterAs.OWNER && dto.role !== RegisterAs.OWNER) {
        throw new BadRequestException(
          'Transfer ownership before changing the owner role.',
        );
      }
      if (dto.role === RegisterAs.OWNER) {
        throw new BadRequestException(
          'Cannot promote a user to owner from admin users. Use ownership transfer.',
        );
      }
      if (dto.role === RegisterAs.SUPER_ADMIN) {
        throw new BadRequestException('Invalid role.');
      }
      user.role = dto.role;
    }

    await this.userRepository.save(user);
    return this.mapUser(user);
  }

  async updateStatus(id: string, dto: UpdateAdminUserStatusDto) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { organization: true },
    });

    if (!user || user.isPlatformAdmin) {
      throw new NotFoundException('User not found.');
    }

    if (user.role === RegisterAs.OWNER && dto.status === AccountStatus.SUSPENDED) {
      throw new BadRequestException(
        'Suspend the organization instead of suspending the owner directly.',
      );
    }

    user.accountStatus = dto.status;
    await this.userRepository.save(user);

    if (dto.status === AccountStatus.SUSPENDED) {
      await invalidateUserSessions(this.userRepository, user.id);
    }

    return this.mapUser(user);
  }

  async remove(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: { organization: true },
    });

    if (!user || user.isPlatformAdmin) {
      throw new NotFoundException('User not found.');
    }

    if (user.role === RegisterAs.OWNER) {
      throw new BadRequestException(
        'Cannot delete an organization owner. Suspend or delete the organization instead.',
      );
    }

    await invalidateUserSessions(this.userRepository, user.id);
    await this.userRepository.remove(user);
    return { message: 'User deleted successfully.', id };
  }

  private mapUser(user: User): AdminUserRecord {
    return {
      id: user.id,
      name: user.fullName,
      email: user.email,
      organization: user.organization?.name ?? '—',
      organizationId: user.organizationId,
      role: this.mapRoleLabel(user.role),
      lastActive: user.lastActiveAt
        ? user.lastActiveAt.toISOString()
        : user.updatedAt.toISOString(),
      status: user.accountStatus,
    };
  }

  private mapRoleLabel(role: RegisterAs) {
    switch (role) {
      case RegisterAs.OWNER:
      case RegisterAs.ADMIN:
        return 'Admin';
      case RegisterAs.MANAGER:
        return 'Manager';
      case RegisterAs.MEMBER:
        return 'Member';
      default:
        return role;
    }
  }
}
