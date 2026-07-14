import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  ProjectCategory,
  ProjectPriority,
  ProjectStatus,
  ProjectTheme,
  ProjectVisibility,
} from '../../enum/project.enum';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

export class CreateProjectDto {
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name: string;

  @IsString()
  @MinLength(2)
  @MaxLength(12)
  key: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(ProjectCategory)
  category?: ProjectCategory;

  @IsOptional()
  @IsEnum(ProjectPriority)
  priority?: ProjectPriority;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsEnum(ProjectVisibility)
  visibility?: ProjectVisibility;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  memberIds?: string[];

  @IsOptional()
  @IsUUID('4')
  leadUserId?: string;
}

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(12)
  key?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsEnum(ProjectCategory)
  category?: ProjectCategory;

  @IsOptional()
  @IsEnum(ProjectPriority)
  priority?: ProjectPriority;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @IsOptional()
  @IsEnum(ProjectVisibility)
  visibility?: ProjectVisibility;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @Type(() => Number)
  progress?: number;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  memberIds?: string[];

  @IsOptional()
  @IsUUID('4')
  leadUserId?: string;
}

export class ListProjectsQueryDto extends PaginationQueryDto {}

export class UpdateMyProjectThemeDto {
  @IsEnum(ProjectTheme)
  theme: ProjectTheme;
}
