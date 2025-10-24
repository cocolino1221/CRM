import {
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsArray,
  IsObject,
  IsUUID,
  Length,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ContactStatus, ContactSource } from '../../database/entities/contact.entity';

export class CreateContactDto {
  @IsString()
  @Length(1, 100)
  @Transform(({ value }) => value?.trim())
  firstName: string;

  @IsString()
  @Length(1, 100)
  @Transform(({ value }) => value?.trim())
  lastName: string;

  @IsEmail()
  @Length(1, 255)
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => {
    const trimmed = value?.trim();
    return trimmed === '' ? undefined : trimmed;
  })
  @Length(1, 20, { message: 'Phone must be between 1 and 20 characters' })
  @Matches(/^[+]?[\d\s\-\(\)]+$/, { message: 'Phone must be a valid phone number format' })
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  jobTitle?: string;

  @IsOptional()
  @IsEnum(ContactStatus)
  status?: ContactStatus;

  @IsOptional()
  @IsEnum(ContactSource)
  source?: ContactSource;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  leadScore?: number;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  notes?: string;

  @IsOptional()
  @IsObject()
  customFields?: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Length(1, 50, { each: true })
  tags?: string[];

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  emailOptIn?: boolean;

  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;
}