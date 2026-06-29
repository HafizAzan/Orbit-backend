import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RegisterAs } from '../../enum/auth.enum';

export class UpdateWorkspaceOrganizationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  billingEmail?: string;
}

export class UpdateOrganizationMemberRoleDto {
  @IsEnum(RegisterAs)
  role: RegisterAs;
}

export class UpdateOrganizationMemberEmailDto {
  @IsEmail()
  email: string;
}
