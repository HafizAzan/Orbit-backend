import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { AccountStatus, RegisterAs } from '../../enum/auth.enum';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class ListAdminUsersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  organizationId?: string;
}

export class UpdateAdminUserStatusDto {
  @IsEnum(AccountStatus)
  status: AccountStatus;
}

export class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsEnum(RegisterAs)
  role?: RegisterAs;
}
