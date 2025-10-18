import {
  IsEmail,
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

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
    description: 'User password',
    minLength: 8,
    maxLength: 128,
    example: 'SecurePass123!',
  })
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must be less than 128 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
  })
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
}