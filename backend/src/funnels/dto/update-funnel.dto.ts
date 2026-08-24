import { PartialType } from '@nestjs/mapped-types';
import { CreateFunnelDto } from './create-funnel.dto';

export class UpdateFunnelDto extends PartialType(CreateFunnelDto) {}
