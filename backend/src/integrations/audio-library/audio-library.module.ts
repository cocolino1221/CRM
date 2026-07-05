import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Workspace } from '../../database/entities/workspace.entity';
import { UploadModule } from '../../upload/upload.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { MetaMessagingModule } from '../meta-messaging/meta-messaging.module';
import { AudioLibraryController } from './audio-library.controller';
import { AudioLibraryService } from './audio-library.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Workspace]),
    UploadModule,
    WhatsAppModule,
    MetaMessagingModule,
  ],
  controllers: [AudioLibraryController],
  providers: [AudioLibraryService],
  exports: [AudioLibraryService],
})
export class AudioLibraryModule {}
