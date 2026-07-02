import { RegisterAs } from '../../enum/auth.enum';
import {
  canChangeOwnEmail,
  canRequestOwnEmailChange,
  getEmailChangeRequestRecipientRoles,
} from './email-access.util';

describe('email access for manager role', () => {
  it('cannot change own email directly', () => {
    expect(canChangeOwnEmail(RegisterAs.MANAGER)).toBe(false);
  });

  it('can request an email change through admins', () => {
    expect(canRequestOwnEmailChange(RegisterAs.MANAGER)).toBe(true);
  });

  it('routes email change requests to workspace admins', () => {
    expect(getEmailChangeRequestRecipientRoles(RegisterAs.MANAGER)).toEqual([
      RegisterAs.ADMIN,
    ]);
  });
});
