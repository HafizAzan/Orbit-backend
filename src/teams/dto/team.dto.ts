import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { RegisterAs } from '../../enum/auth.enum';
import { MemberDepartment } from '../../enum/member.enum';

export class InviteTeamMemberDto {
  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsEnum(RegisterAs)
  role: RegisterAs;

  @IsEnum(MemberDepartment)
  department: MemberDepartment;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  message?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  sendWelcomeEmail?: boolean;
}

export class UpdateTeamMemberRoleDto {
  @IsEnum(RegisterAs)
  role: RegisterAs;
}

export class UpdateTeamMemberStatusDto {
  @IsIn(['active', 'deactivated'])
  status: 'active' | 'deactivated';
}
