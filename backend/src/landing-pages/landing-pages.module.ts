import { Module } from '@nestjs/common';
import { Resolver } from 'dns/promises';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LandingPagesService } from './landing-pages.service';
import { LandingPagesController } from './landing-pages.controller';
import { LandingDomainsService, DNS_RESOLVER } from './landing-domains.service';
import { LandingPage } from '../database/entities/landing-page.entity';
import { LandingDomain } from '../database/entities/landing-domain.entity';
import { FormsModule } from '../forms/forms.module';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { FunnelsModule } from '../funnels/funnels.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LandingPage, LandingDomain]),
    FormsModule,
    WhatsAppModule,
    FunnelsModule,
  ],
  controllers: [LandingPagesController],
  providers: [
    LandingPagesService,
    LandingDomainsService,
    {
      // A real resolver in the app, a stub in tests — domain verification must
      // never depend on the network to be testable.
      provide: DNS_RESOLVER,
      useFactory: () => new Resolver(),
    },
  ],
  exports: [LandingPagesService, LandingDomainsService],
})
export class LandingPagesModule {}
