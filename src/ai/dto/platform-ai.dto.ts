import { IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class AskPlatformDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  question: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

export class OrgHealthDto {
  @IsUUID()
  organizationId: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}

export class DescribePlatformActivityDto {
  @IsUUID()
  activityId: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string;
}
