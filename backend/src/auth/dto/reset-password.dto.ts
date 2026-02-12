import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsStrongPassword } from '../validators/password.validator';

export class ResetPasswordDto {
  @ApiProperty({
    description: 'Password reset token from email',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiProperty({
    description: 'New strong password (min 12 characters, uppercase, lowercase, number, special character)',
    example: 'NewSecureP@ss123!',
    minLength: 12,
  })
  @IsString()
  @IsNotEmpty()
  @IsStrongPassword()
  newPassword: string;
}
