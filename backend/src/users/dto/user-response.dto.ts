import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose } from 'class-transformer';
import { UserRole, UserStatus } from '../../database/entities/user.entity';

@Exclude()
export class UserResponseDto {
  @ApiProperty()
  @Expose()
  id: string;

  @ApiProperty()
  @Expose()
  email: string;

  @ApiProperty()
  @Expose()
  firstName: string;

  @ApiProperty()
  @Expose()
  lastName: string;

  @ApiProperty()
  @Expose()
  fullName: string;

  @ApiProperty({ enum: UserRole })
  @Expose()
  role: UserRole;

  @ApiProperty({ enum: UserStatus })
  @Expose()
  status: UserStatus;

  @ApiPropertyOptional()
  @Expose()
  avatar?: string;

  @ApiPropertyOptional()
  @Expose()
  slackUserId?: string;

  @ApiPropertyOptional()
  @Expose()
  lastLoginAt?: Date;

  @ApiProperty()
  @Expose()
  createdAt: Date;

  @ApiProperty()
  @Expose()
  updatedAt: Date;

  // Exclude sensitive data
  password: string;
  failedLoginAttempts: number;
  lockedUntil?: Date;
}
