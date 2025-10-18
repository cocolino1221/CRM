import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateContactDto } from './create-contact.dto';

export class ImportContactsDto {
  @ApiProperty({
    description: 'Array of contacts to import',
    type: [CreateContactDto],
    example: [
      {
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
        phone: '+1234567890',
      },
    ],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateContactDto)
  contacts: CreateContactDto[];
}