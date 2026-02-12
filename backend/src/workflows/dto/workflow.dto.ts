import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsEnum, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { WorkflowTriggerType, WorkflowActionType, WorkflowStatus } from '../../database/entities/workflow.entity';

export class WorkflowActionDto {
  @ApiProperty()
  @IsString()
  id: string;

  @ApiProperty({ enum: WorkflowActionType })
  @IsEnum(WorkflowActionType)
  type: WorkflowActionType;

  @ApiProperty()
  config: any;

  @ApiProperty({ required: false })
  @IsOptional()
  condition?: {
    field: string;
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'not_equals';
    value: any;
  };
}

export class CreateWorkflowDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: WorkflowTriggerType })
  @IsEnum(WorkflowTriggerType)
  triggerType: WorkflowTriggerType;

  @ApiProperty({ required: false })
  @IsOptional()
  triggerConfig?: any;

  @ApiProperty({ type: [WorkflowActionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowActionDto)
  actions: WorkflowActionDto[];
}

export class UpdateWorkflowDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: WorkflowStatus, required: false })
  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @ApiProperty({ enum: WorkflowTriggerType, required: false })
  @IsOptional()
  @IsEnum(WorkflowTriggerType)
  triggerType?: WorkflowTriggerType;

  @ApiProperty({ required: false })
  @IsOptional()
  triggerConfig?: any;

  @ApiProperty({ type: [WorkflowActionDto], required: false })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowActionDto)
  actions?: WorkflowActionDto[];
}
