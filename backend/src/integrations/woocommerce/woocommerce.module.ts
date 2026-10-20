import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Integration } from '../../database/entities/integration.entity';
import { Contact } from '../../database/entities/contact.entity';
import { Deal } from '../../database/entities/deal.entity';
import { PipelineStage } from '../../database/entities/pipeline-stage.entity';
import { ContactsModule } from '../../contacts/contacts.module';
import { WooCommerceController } from './woocommerce.controller';
import { WooCommerceService } from './woocommerce.service';

@Module({
  imports: [HttpModule, TypeOrmModule.forFeature([Integration, Contact, Deal, PipelineStage]), ContactsModule],
  controllers: [WooCommerceController],
  providers: [WooCommerceService],
  exports: [WooCommerceService],
})
export class WooCommerceModule {}
