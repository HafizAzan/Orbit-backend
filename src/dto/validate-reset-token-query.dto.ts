import { IsNotEmpty, IsString } from 'class-validator';

export class ValidateResetTokenQueryDto {
  @IsString()
  @IsNotEmpty({ message: 'Reset token is required' })
  token: string;
}
