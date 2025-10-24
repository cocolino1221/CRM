import {
  IsOptional,
  IsString,
  IsEnum,
  IsNumber,
  IsArray,
  IsBoolean,
  IsUUID,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ContactStatus, ContactSource } from '../../database/entities/contact.entity';

export enum SortField {
  CREATED_AT = 'createdAt',
  UPDATED_AT = 'updatedAt',
  FIRST_NAME = 'firstName',
  LAST_NAME = 'lastName',
  EMAIL = 'email',
  LEAD_SCORE = 'leadScore',
  LAST_CONTACTED_AT = 'lastContactedAt',
}

export enum SortOrder {
  ASC = 'ASC',
  DESC = 'DESC',
}

export class QueryContactsDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @Max(500)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(ContactStatus)
  status?: ContactStatus;

  @IsOptional()
  @IsEnum(ContactSource)
  source?: ContactSource;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Transform(({ value }) => Array.isArray(value) ? value : [value])
  tags?: string[];

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  minLeadScore?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  maxLeadScore?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  emailOptIn?: boolean;

  @IsOptional()
  @IsEnum(SortField)
  sortBy?: SortField = SortField.CREATED_AT;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeCompany?: boolean = false;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeOwner?: boolean = false;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeDeals?: boolean = false;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  includeActivities?: boolean = false;
}