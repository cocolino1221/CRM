import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsStrongPassword } from '../../auth/validators/password.validator';

export class CreatePlatformWorkspaceDto {
  @ApiProperty({ example: 'Acme Corp', description: 'Workspace/company display name' })
  @IsString()
  @MinLength(2)
  @MaxLength(255)
  @Transform(({ value }) => value?.trim())
  name: string;

  @ApiPropertyOptional({
    example: 'acme-corp',
    description: 'Optional custom workspace domain (lowercase letters, numbers, hyphens)',
  })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'Domain must contain only lowercase letters, numbers, and hyphens',
  })
  @Transform(({ value }) => value?.trim().toLowerCase())
  domain?: string;

  @ApiPropertyOptional({
    example: 'trial',
    enum: ['trial', 'starter', 'professional', 'enterprise'],
  })
  @IsOptional()
  @IsString()
  @IsIn(['trial', 'starter', 'professional', 'enterprise'])
  plan?: 'trial' | 'starter' | 'professional' | 'enterprise';

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ example: 'owner@acme.com', description: 'Initial workspace admin email' })
  @IsEmail()
  @Transform(({ value }) => value?.trim().toLowerCase())
  adminEmail: string;

  @ApiProperty({ example: 'John', description: 'Initial workspace admin first name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  adminFirstName: string;

  @ApiProperty({ example: 'Doe', description: 'Initial workspace admin last name' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  adminLastName: string;

  @ApiProperty({
    example: 'SecurePass123!',
    description: 'Initial workspace admin password',
    minLength: 12,
  })
  @IsString()
  @IsStrongPassword()
  adminPassword: string;
}
