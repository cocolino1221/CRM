import { PartialType } from '@nestjs/mapped-types';
import { CreateContactDto } from './create-contact.dto';
import { IsOptional, IsDateString } from 'class-validator';

export class UpdateContactDto extends PartialType(CreateContactDto) {
  @IsOptional()
  @IsDateString()
  lastContactedAt?: Date;
}