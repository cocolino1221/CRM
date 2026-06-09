import { IsObject, IsOptional } from 'class-validator';

export class SubmitLandingPageDto {
  @IsObject()
  data: Record<string, any>;

  @IsOptional()
  @IsObject()
  trackingData?: Record<string, any>;
}
