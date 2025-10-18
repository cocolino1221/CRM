import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from '../../database/entities/user.entity';

export class InviteUserDto {
  @ApiProperty({
    description: 'Email address to send invitation',
    example: 'newuser@company.com',
  })
  @IsEmail()
  email: string;

  @ApiProperty({
    description: 'Role to assign to the user',
    enum: UserRole,
    example: UserRole.SETTER,
  })
  @IsEnum(UserRole)
  role: UserRole;

  @ApiPropertyOptional({
    description: 'Custom message to include in invitation email',
    example: 'Welcome to our sales team!',
  })
  @IsString()
  @IsOptional()
  customMessage?: string;
}
