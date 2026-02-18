import {
  IsEmail,
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsStrongPassword } from '../validators/password.validator';

/**
 * Registration DTO with comprehensive validation
 */
export class RegisterDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
    format: 'email',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({
    description: 'User password (min 12 characters, uppercase, lowercase, number, special character)',
    minLength: 12,
    maxLength: 128,
    example: 'SecurePass123!',
  })
  @IsString({ message: 'Password must be a string' })
  @IsStrongPassword()
  password: string;

  @ApiProperty({
    description: 'User first name',
    minLength: 1,
    maxLength: 100,
    example: 'John',
  })
  @IsString({ message: 'First name must be a string' })
  @IsNotEmpty({ message: 'First name is required' })
  @MinLength(1, { message: 'First name cannot be empty' })
  @MaxLength(100, { message: 'First name must be less than 100 characters' })
  @Transform(({ value }) => value?.trim())
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    minLength: 1,
    maxLength: 100,
    example: 'Doe',
  })
  @IsString({ message: 'Last name must be a string' })
  @IsNotEmpty({ message: 'Last name is required' })
  @MinLength(1, { message: 'Last name cannot be empty' })
  @MaxLength(100, { message: 'Last name must be less than 100 characters' })
  @Transform(({ value }) => value?.trim())
  lastName: string;

  @ApiPropertyOptional({
    description: 'Workspace name (for new workspace creation)',
    maxLength: 255,
    example: 'Acme Corp',
  })
  @IsOptional()
  @IsString({ message: 'Workspace name must be a string' })
  @MaxLength(255, { message: 'Workspace name must be less than 255 characters' })
  @Transform(({ value }) => value?.trim())
  workspaceName?: string;

  @ApiPropertyOptional({
    description: 'Existing workspace domain to join',
    example: 'acme-corp',
  })
  @IsOptional()
  @IsString({ message: 'Workspace domain must be a string' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  workspaceDomain?: string;

  @ApiPropertyOptional({
    description: 'Workspace invite code for direct join (skips approval)',
    example: 'A1B2C3D4',
  })
  @IsOptional()
  @IsString({ message: 'Invite code must be a string' })
  @Transform(({ value }) => value?.toUpperCase().trim())
  inviteCode?: string;
}