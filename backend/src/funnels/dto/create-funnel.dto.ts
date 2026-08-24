import { IsString, IsOptional, IsEnum, IsUUID, IsDateString, MaxLength } from 'class-validator';
import { FunnelStatus } from '../../database/entities/funnel.entity';

export class CreateFunnelDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsEnum(FunnelStatus)
  status?: FunnelStatus;

  @IsUUID()
  integrationId: string;

  @IsString()
  flowId: string;

  @IsOptional()
  @IsDateString()
  anchorDate?: string;
}
