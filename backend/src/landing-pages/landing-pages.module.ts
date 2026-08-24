import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LandingPagesService } from './landing-pages.service';
import { LandingPagesController } from './landing-pages.controller';
import { LandingPage } from '../database/entities/landing-page.entity';
import { FormsModule } from '../forms/forms.module';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { FunnelsModule } from '../funnels/funnels.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LandingPage]),
    FormsModule,
    WhatsAppModule,
    FunnelsModule,
  ],
  controllers: [LandingPagesController],
  providers: [LandingPagesService],
  exports: [LandingPagesService],
})
export class LandingPagesModule {}
