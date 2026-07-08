import { IsString, Length, MinLength } from 'class-validator';

export class VerifyTwoFactorDto {
  @IsString()
  @MinLength(10)
  challengeToken: string;

  @IsString()
  @Length(6, 6)
  code: string;
}

export class EnableTwoFactorDto {
  @IsString()
  @Length(6, 6)
  code: string;
}

export class DisableTwoFactorDto {
  @IsString()
  @Length(6, 6)
  code: string;

  @IsString()
  @MinLength(8)
  password: string;
}
