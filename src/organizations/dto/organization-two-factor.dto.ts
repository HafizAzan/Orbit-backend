import { IsString, Length } from 'class-validator';

export class ConfirmOrganizationTwoFactorDto {
  @IsString()
  @Length(6, 6)
  code: string;
}
