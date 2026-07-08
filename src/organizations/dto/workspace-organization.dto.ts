import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RegisterAs } from '../../enum/auth.enum';

export class UpdateOrganizationWorkspaceSettingsDto {
  @IsOptional()
  @IsBoolean()
  dailyDigest?: boolean;

  @IsOptional()
  @IsBoolean()
  realtimePush?: boolean;

  @IsOptional()
  @IsBoolean()
  weeklyReport?: boolean;

  @IsOptional()
  @IsBoolean()
  twoFactorRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  sessionTimeoutEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  sessionTimeoutMinutes?: number;
}

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

  @IsOptional()
  @Type(() => UpdateOrganizationWorkspaceSettingsDto)
  workspaceSettings?: UpdateOrganizationWorkspaceSettingsDto;
}

export class UpdateOrganizationMemberRoleDto {
  @IsEnum(RegisterAs)
  role: RegisterAs;
}

export class UpdateOrganizationMemberEmailDto {
  @IsEmail()
  email: string;
}
