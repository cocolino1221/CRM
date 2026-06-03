import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Integration } from '../database/entities/integration.entity';
import { SmartBillController } from './smartbill.controller';
import { SmartBillService } from './smartbill.service';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([Integration])],
  controllers: [SmartBillController],
  providers: [SmartBillService],
  exports: [SmartBillService],
})
export class SmartBillModule {}
