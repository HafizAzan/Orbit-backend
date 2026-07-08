import { IsString, IsUUID, MinLength } from 'class-validator';

export class TransferOrganizationOwnershipDto {
  @IsUUID()
  targetMemberId: string;

  @IsString()
  @MinLength(8)
  password: string;
}
