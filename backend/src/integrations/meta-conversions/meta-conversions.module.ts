import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { MetaConversionsService } from './meta-conversions.service';

@Module({
  imports: [HttpModule],
  providers: [MetaConversionsService],
  exports: [MetaConversionsService],
})
export class MetaConversionsModule {}
