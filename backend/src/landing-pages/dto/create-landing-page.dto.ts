import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  LandingPageStatus,
  LandingPageCaptureType,
  LandingPageContent,
  LandingPageTypeformConfig,
  LandingPagePostSubmit,
  LandingPageSeo,
} from '../../database/entities/landing-page.entity';

export class CreateLandingPageDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsEnum(LandingPageStatus)
  status?: LandingPageStatus;

  @IsOptional()
  @IsObject()
  content?: LandingPageContent;

  @IsOptional()
  @IsEnum(LandingPageCaptureType)
  captureType?: LandingPageCaptureType;

  @IsOptional()
  @IsUUID()
  formId?: string;

  @IsOptional()
  @IsUUID()
  funnelId?: string;

  @IsOptional()
  @IsObject()
  typeformConfig?: LandingPageTypeformConfig;

  @IsOptional()
  @IsObject()
  postSubmit?: LandingPagePostSubmit;

  @IsOptional()
  @IsObject()
  seo?: LandingPageSeo;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  experimentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  variantGroup?: string;
}
