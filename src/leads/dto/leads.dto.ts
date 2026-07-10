import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const SUBJECTS = [
  'general',
  'support',
  'sales',
  'partnership',
  'billing',
  'enterprise',
] as const;

export class CreateContactLeadDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  companyName?: string;

  @IsIn(SUBJECTS)
  subject: (typeof SUBJECTS)[number];

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  source?: string;
}

export class UpdateContactLeadStatusDto {
  @IsIn(['new', 'reviewed', 'closed'])
  status: 'new' | 'reviewed' | 'closed';
}

export class ListContactLeadsQueryDto {
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsIn(['new', 'reviewed', 'closed'])
  status?: 'new' | 'reviewed' | 'closed';
}
