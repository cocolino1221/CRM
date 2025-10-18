import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsNumber, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { CompanySize, CompanyIndustry } from '../../database/entities/company.entity';

export class QueryCompaniesDto {
  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ description: 'Items per page', minimum: 1, maximum: 100, default: 20 })
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Search query (searches name, domain, description)' })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({ description: 'Filter by industry', enum: CompanyIndustry })
  @IsEnum(CompanyIndustry)
  @IsOptional()
  industry?: CompanyIndustry;

  @ApiPropertyOptional({ description: 'Filter by company size', enum: CompanySize })
  @IsEnum(CompanySize)
  @IsOptional()
  size?: CompanySize;

  @ApiPropertyOptional({ description: 'Minimum employee count' })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  minEmployees?: number;

  @ApiPropertyOptional({ description: 'Maximum employee count' })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  @IsOptional()
  maxEmployees?: number;

  @ApiPropertyOptional({ description: 'Filter by country' })
  @IsString()
  @IsOptional()
  country?: string;

  @ApiPropertyOptional({ description: 'Filter by state/province' })
  @IsString()
  @IsOptional()
  state?: string;

  @ApiPropertyOptional({ description: 'Filter by city' })
  @IsString()
  @IsOptional()
  city?: string;

  @ApiPropertyOptional({ description: 'Sort by field', enum: ['name', 'createdAt', 'updatedAt', 'employeeCount'] })
  @IsString()
  @IsOptional()
  sortBy?: string = 'createdAt';

  @ApiPropertyOptional({ description: 'Sort order', enum: ['ASC', 'DESC'] })
  @IsString()
  @IsOptional()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  @ApiPropertyOptional({ description: 'Filter by tags (comma-separated)' })
  @IsString()
  @IsOptional()
  tags?: string;
}