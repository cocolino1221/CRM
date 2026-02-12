import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { UserRole } from '../../database/entities/user.entity';
import { IsStrongPassword } from '../../auth/validators/password.validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@company.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName: string;

  @ApiProperty({
    description: 'User password (min 12 characters, uppercase, lowercase, number, special character)',
    example: 'SecurePass123!',
  })
  @IsString()
  @IsStrongPassword()
  password: string;

  @ApiProperty({
    description: 'User role in workspace',
    enum: UserRole,
    example: UserRole.SETTER,
  })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({
    description: 'User avatar URL',
    example: 'https://example.com/avatar.jpg',
  })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiPropertyOptional({
    description: 'Slack user ID for integration',
    example: 'U12345678',
  })
  @IsString()
  @IsOptional()
  slackUserId?: string;
}
