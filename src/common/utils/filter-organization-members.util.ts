import type { User } from '../../entities/user.entity';
import { RegisterAs } from '../../enum/auth.enum';

export function filterOrganizationMembersForList(
  members: User[],
  isOwnerNeeded?: boolean,
) {
  if (isOwnerNeeded === true) {
    return members;
  }

  return members.filter((member) => member.role !== RegisterAs.OWNER);
}
