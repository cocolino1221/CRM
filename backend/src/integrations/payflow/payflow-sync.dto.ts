import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsNumber, IsOptional, IsString, IsUUID, ValidateNested } from 'class-validator';

class PayflowCustomerDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() name?: string;
  @IsEmail() email: string;
  @IsOptional() @IsString() phone?: string;
}

export class PayflowSyncDto {
  @ValidateNested() @Type(() => PayflowCustomerDto) customer: PayflowCustomerDto;
  /** Amount in major units (e.g. 49.99). Omit to sync only the contact. */
  @IsOptional() @IsNumber() amount?: number;
  @IsOptional() @IsString() currency?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() transactionId?: string;
  @IsOptional() @IsIn(['won', 'lost']) status?: 'won' | 'lost';
  @IsOptional() @IsUUID() pipelineId?: string;
  @IsOptional() @IsUUID() pipelineStageId?: string;
}
