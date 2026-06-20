import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { CalendarEventType } from '../../enum/calendar.enum';

export class ListCalendarEventsQueryDto extends PaginationQueryDto {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}

export class ListCalendarProjectsQueryDto extends PaginationQueryDto {}

export class CreateCalendarEventDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  @IsDateString()
  date: string;

  @IsEnum(CalendarEventType)
  type: CalendarEventType;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateCalendarEventDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsEnum(CalendarEventType)
  type?: CalendarEventType;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}
