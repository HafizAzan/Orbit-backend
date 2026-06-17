import { IsNotEmpty, IsString } from 'class-validator';

export class ValidateInviteTokenQueryDto {
  @IsString()
  @IsNotEmpty({ message: 'Invite token is required' })
  token: string;
}
