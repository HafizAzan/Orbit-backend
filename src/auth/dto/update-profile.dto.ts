import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  @MaxLength(50, { message: 'Full name must be less than 50 characters' })
  @MinLength(4, { message: 'Full name must be at least 4 characters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName: string;
}
