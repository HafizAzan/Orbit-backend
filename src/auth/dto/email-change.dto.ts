import { IsEmail, IsString, Length, MinLength } from 'class-validator';

export class InitiateEmailChangeDto {
  @IsEmail()
  newEmail: string;

  @IsString()
  @MinLength(8)
  currentPassword: string;
}

export class ConfirmEmailChangeDto {
  @IsEmail()
  newEmail: string;

  @IsString()
  @Length(6, 6)
  otp: string;
}
