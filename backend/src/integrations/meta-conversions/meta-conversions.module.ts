import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Integration } from '../../database/entities/integration.entity';
import { MetaConversionsController } from './meta-conversions.controller';
import { MetaConversionsService } from './meta-conversions.service';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([Integration])],
  controllers: [MetaConversionsController],
  providers: [MetaConversionsService],
  exports: [MetaConversionsService],
})
export class MetaConversionsModule {}
