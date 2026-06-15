import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { AuthProvider, RegisterAs, SignupSource } from 'src/enum/auth.enum';

export class RegisterDto {
  @IsString()
  @IsNotEmpty({ message: 'Full name is required' })
  @MaxLength(50, { message: 'Full name must be less than 50 characters' })
  @MinLength(4, { message: 'Full name must be at least 4 characters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName: string;

  @IsString()
  @IsNotEmpty({ message: 'Organization name is required' })
  @MaxLength(50, {
    message: 'Organization name must be less than 50 characters',
  })
  @MinLength(4, { message: 'Organization name must be at least 4 characters' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  organizationName: string;

  @IsString()
  @IsNotEmpty({ message: 'Organization slug is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  organizationSlug: string;

  @IsEmail()
  @IsNotEmpty({ message: 'Email is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Please enter your password' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password: string;

  @IsEnum(AuthProvider)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  authProvider: AuthProvider;

  @IsEnum(SignupSource)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  signupSource: SignupSource;

  @ValidateIf((o) => o.signupSource === SignupSource.INVITE)
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty({ message: 'Invite token is required for invited signups' })
  inviteToken?: string;

  @IsEnum(RegisterAs)
  @IsNotEmpty({ message: 'Kind of user is required' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  kindOfUser: RegisterAs;
}
