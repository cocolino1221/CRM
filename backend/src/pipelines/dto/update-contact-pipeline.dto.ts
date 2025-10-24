import {
  IsUUID,
  IsOptional,
} from 'class-validator';

export class UpdateContactPipelineDto {
  @IsOptional()
  @IsUUID()
  pipelineId?: string;

  @IsOptional()
  @IsUUID()
  pipelineStageId?: string;

  @IsOptional()
  @IsUUID()
  setterId?: string;

  @IsOptional()
  @IsUUID()
  callerId?: string;

  @IsOptional()
  @IsUUID()
  closerId?: string;
}
