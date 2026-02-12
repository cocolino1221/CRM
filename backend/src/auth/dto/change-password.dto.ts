import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStrongPassword } from '../validators/password.validator';

/**
 * DTO for changing user password
 * Requires current password for verification and new strong password
 */
export class ChangePasswordDto {
  @ApiProperty({
    description: 'Current password for verification',
    example: 'OldPassword123!',
    minLength: 8,
    maxLength: 128,
  })
  @IsString({ message: 'Current password must be a string' })
  @IsNotEmpty({ message: 'Current password is required' })
  @MinLength(8, { message: 'Current password must be at least 8 characters' })
  @MaxLength(128, { message: 'Current password must be less than 128 characters' })
  currentPassword: string;

  @ApiProperty({
    description: 'New strong password (min 12 characters, uppercase, lowercase, number, special character)',
    example: 'NewSecureP@ss123!',
    minLength: 12,
    maxLength: 128,
  })
  @IsString({ message: 'New password must be a string' })
  @IsNotEmpty({ message: 'New password is required' })
  @IsStrongPassword()
  newPassword: string;
}
