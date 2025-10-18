import { ApiProperty } from '@nestjs/swagger';
import { IsUUID, IsArray, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class MergeContactsDto {
  @ApiProperty({
    description: 'Primary contact ID (this contact will be kept)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  primaryContactId: string;

  @ApiProperty({
    description: 'Array of contact IDs to merge into the primary contact (will be deleted after merge)',
    type: [String],
    example: ['223e4567-e89b-12d3-a456-426614174000', '323e4567-e89b-12d3-a456-426614174000'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsUUID('4', { each: true })
  contactIdsToMerge: string[];
}