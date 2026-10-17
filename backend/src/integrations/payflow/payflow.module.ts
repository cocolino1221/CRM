import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Integration } from '../../database/entities/integration.entity';
import { Contact } from '../../database/entities/contact.entity';
import { Deal } from '../../database/entities/deal.entity';
import { Pipeline } from '../../database/entities/pipeline.entity';
import { ContactsModule } from '../../contacts/contacts.module';
import { DealsModule } from '../../deals/deals.module';
import { PayflowController } from './payflow.controller';
import { PayflowService } from './payflow.service';

@Module({
  imports: [TypeOrmModule.forFeature([Integration, Contact, Deal, Pipeline]), ContactsModule, DealsModule],
  controllers: [PayflowController],
  providers: [PayflowService],
})
export class PayflowModule {}
