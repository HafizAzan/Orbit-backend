import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ActivityModule } from '../../enum/activity.enum';
import {
  ActivityFlagReason,
  ActivityReviewStatus,
} from '../../enum/activity-review.enum';

export class ListAdminActivityQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(ActivityModule)
  module?: ActivityModule;

  @IsOptional()
  @IsEnum(ActivityReviewStatus)
  reviewStatus?: ActivityReviewStatus;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Boolean)
  flagged?: boolean;
}

export class FlagAdminActivityDto {
  @IsEnum(ActivityFlagReason)
  reason: ActivityFlagReason;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  note?: string;
}
