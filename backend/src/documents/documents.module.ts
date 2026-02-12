import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { Document } from '../database/entities/document.entity';
import { User } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';
import { Deal } from '../database/entities/deal.entity';
import { Integration } from '../database/entities/integration.entity';
import { PandaDocIntegrationHandler } from '../integrations/handlers/pandadoc.handler';
import { DocuSignIntegrationHandler } from '../integrations/handlers/docusign.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Document,
      User,
      Contact,
      Deal,
      Integration,
    ]),
    HttpModule,
  ],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    PandaDocIntegrationHandler,
    DocuSignIntegrationHandler,
  ],
  exports: [DocumentsService],
})
export class DocumentsModule {}
