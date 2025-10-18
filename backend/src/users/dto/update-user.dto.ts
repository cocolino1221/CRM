import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsEnum,
} from 'class-validator';
import { UserRole, UserStatus } from '../../database/entities/user.entity';

export class UpdateUserDto {
  @ApiPropertyOptional({
    description: 'User first name',
    example: 'John',
  })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(100)
  firstName?: string;

  @ApiPropertyOptional({
    description: 'User last name',
    example: 'Doe',
  })
  @IsString()
  @IsOptional()
  @MinLength(1)
  @MaxLength(100)
  lastName?: string;

  @ApiPropertyOptional({
    description: 'User avatar URL',
    example: 'https://example.com/avatar.jpg',
  })
  @IsString()
  @IsOptional()
  avatar?: string;

  @ApiPropertyOptional({
    description: 'Slack user ID',
    example: 'U12345678',
  })
  @IsString()
  @IsOptional()
  slackUserId?: string;
}

export class UpdateUserRoleDto {
  @ApiPropertyOptional({
    description: 'User role',
    enum: UserRole,
    example: UserRole.CLOSER,
  })
  @IsEnum(UserRole)
  role: UserRole;
}

export class UpdateUserStatusDto {
  @ApiPropertyOptional({
    description: 'User status',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  @IsEnum(UserStatus)
  status: UserStatus;
}
