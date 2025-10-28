import {
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  ValidateNested,
  Length,
  IsInt,
  Min,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePipelineStageDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'color must be a valid hex color code (e.g., #3B82F6)',
  })
  color?: string;

  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isClosedWon?: boolean;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isClosedLost?: boolean;
}

export class CreatePipelineDto {
  @IsString()
  @Length(1, 100)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  isDefault?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePipelineStageDto)
  stages?: CreatePipelineStageDto[];
}
