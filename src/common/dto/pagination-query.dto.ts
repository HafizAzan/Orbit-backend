import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

export type PaginatedResponse<T> = {
  data: T[];
  page: number;
  limit: number;
  total: number;
};

export function resolvePagination(query: PaginationQueryDto = {}) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;

  return {
    page,
    limit,
    skip: (page - 1) * limit,
    take: limit,
  };
}

export function buildPaginatedResponse<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  return {
    data,
    page,
    limit,
    total,
  };
}

export function paginateArray<T>(
  items: T[],
  query: PaginationQueryDto = {},
): PaginatedResponse<T> {
  const { page, limit, skip, take } = resolvePagination(query);

  return buildPaginatedResponse(
    items.slice(skip, skip + take),
    items.length,
    page,
    limit,
  );
}
