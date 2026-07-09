import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TaskPriority } from '../../enum/task.enum';

export class GenerateWorkBreakdownDto {
  @IsUUID()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  requirement: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

export class GenerateProjectSummaryDto {
  @IsUUID()
  projectId: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

export class GenerateProjectDraftDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  notes: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  projectName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

export class GenerateTaskDraftDto {
  @IsUUID()
  projectId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  notes: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  taskTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

export class DescribeActivityDto {
  @IsUUID()
  activityId: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

export class GenerateTaskTipDto {
  @IsUUID()
  taskId: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

export class GenerateMembershipImpactDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  changeType: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  changeContext: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

export class GenerateCalendarDraftDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  notes: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  preferredTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  projectName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

export class AskWorkspaceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  question: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

export class ApplyGeneratedTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  estimatedHours?: number | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(50, { each: true })
  labels?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptanceCriteria?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  definitionOfDone?: string[];
}

export class ApplyWorkBreakdownDto {
  @IsUUID()
  projectId: string;

  @IsOptional()
  @IsBoolean()
  updateProjectDescription?: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApplyGeneratedTaskDto)
  tasks: ApplyGeneratedTaskDto[];
}
