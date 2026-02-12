import { IsString, IsOptional, IsEnum, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { FormStatus, FormField, FormSettings } from '../../database/entities/form.entity';

export class CreateFormDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(FormStatus)
  status?: FormStatus;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => Object)
  fields: FormField[];

  @IsOptional()
  @ValidateNested()
  @Type(() => Object)
  settings?: FormSettings;

  @IsOptional()
  @IsString()
  slug?: string;
}
