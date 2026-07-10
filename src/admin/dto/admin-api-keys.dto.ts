import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreatePlatformApiKeyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  label: string;
}

export class UpdatePlatformApiKeyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  label?: string;
}
