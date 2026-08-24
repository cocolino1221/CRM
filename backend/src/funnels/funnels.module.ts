import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FunnelsService } from './funnels.service';
import { FunnelsController } from './funnels.controller';
import { Funnel } from '../database/entities/funnel.entity';
import { FunnelEnrollment } from '../database/entities/funnel-enrollment.entity';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Funnel, FunnelEnrollment]),
    WhatsAppModule,
  ],
  controllers: [FunnelsController],
  providers: [FunnelsService],
  exports: [FunnelsService],
})
export class FunnelsModule {}
