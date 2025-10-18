import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsInt, IsUrl, Min, MaxLength, MinLength, IsEmail } from 'class-validator';
import { CompanySize, CompanyIndustry } from '../../database/entities/company.entity';

export class CreateCompanyDto {
  @ApiProperty({ description: 'Company name', example: 'Acme Corporation' })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ description: 'Company domain', example: 'acme.com' })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  domain?: string;

  @ApiPropertyOptional({ description: 'Company website', example: 'https://acme.com' })
  @IsUrl()
  @IsOptional()
  website?: string;

  @ApiPropertyOptional({ description: 'Company industry', enum: CompanyIndustry })
  @IsEnum(CompanyIndustry)
  @IsOptional()
  industry?: CompanyIndustry;

  @ApiPropertyOptional({ description: 'Company size', enum: CompanySize })
  @IsEnum(CompanySize)
  @IsOptional()
  size?: CompanySize;

  @ApiPropertyOptional({ description: 'Number of employees', example: 250, minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  employeeCount?: number;

  @ApiPropertyOptional({ description: 'Company phone' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'Company description' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Company email' })
  @IsEmail()
  @IsOptional()
  email?: string;
}