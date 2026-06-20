import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import { PaginationQueryDto } from './pagination-query.dto';

function parseOptionalBoolean(value: unknown): boolean {
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return false;
}

export class ListMembersQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => parseOptionalBoolean(value))
  isOwnerNeeded?: boolean = false;
}
