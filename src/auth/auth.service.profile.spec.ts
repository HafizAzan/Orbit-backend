import {
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import * as argon2 from 'argon2';

jest.mock('argon2');
jest.mock('./two-factor.util', () => ({
  generateTwoFactorSecret: jest.fn(() => 'TEST_SECRET'),
  buildTwoFactorOtpAuthUrl: jest.fn(() => 'otpauth://test'),
  verifyTwoFactorCode: jest.fn(async () => true),
}));

import { AuthService } from './auth.service';
import { User } from '../entities/user.entity';

describe('AuthService changePassword', () => {
  const userRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const authService = new AuthService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    userRepository as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const baseUser = {
    id: 'user-1',
    fullName: 'Jane Manager',
    email: 'manager@example.com',
    passwordHash: 'hashed-password',
  } as User;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects an incorrect current password', async () => {
    userRepository.findOne.mockResolvedValue({ ...baseUser });
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    await expect(
      authService.changePassword('user-1', {
        currentPassword: 'wrong-password',
        newPassword: 'NewPassword1',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when the new password matches the current password', async () => {
    userRepository.findOne.mockResolvedValue({ ...baseUser });
    (argon2.verify as jest.Mock).mockResolvedValue(true);

    await expect(
      authService.changePassword('user-1', {
        currentPassword: 'SamePassword1',
        newPassword: 'SamePassword1',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('updates the password hash when validation passes', async () => {
    userRepository.findOne.mockResolvedValue({ ...baseUser });
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    (argon2.hash as jest.Mock).mockResolvedValue('new-hash');
    userRepository.save.mockImplementation(async (user: User) => user);

    const result = await authService.changePassword('user-1', {
      currentPassword: 'CurrentPassword1',
      newPassword: 'NewPassword1',
    });

    expect(result.message).toBe('Password updated successfully');
    expect(userRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ passwordHash: 'new-hash' }),
    );
  });
});
