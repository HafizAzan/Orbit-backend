import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RequestEmailChangeDto {
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  subject: string;

  @IsEmail()
  newEmail: string;

  @IsEmail()
  currentEmail: string;

  @IsString()
  @MinLength(10)
  @MaxLength(1000)
  reason: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  recipientIds: string[];
}
