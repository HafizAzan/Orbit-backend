import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  Matches,
} from 'class-validator';

export class VerifyRegisterDto {
  @IsEmail({}, { message: 'Please enter a valid email' })
  @IsNotEmpty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Please enter the verification code' })
  @Length(6, 6, { message: 'Code must be 6 digits' })
  @Matches(/^\d{6}$/, { message: 'Code must contain only numbers' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  otp: string;
}
