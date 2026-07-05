import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { promises as fs } from 'fs';
import { randomUUID } from 'crypto';
import { Workspace, WorkspaceAudioTemplate } from '../../database/entities/workspace.entity';
import { UploadService } from '../../upload/upload.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { MetaMessagingService, MetaChannel } from '../meta-messaging/meta-messaging.service';

export const AUDIO_LIBRARY_MAX = 10;

export type AudioSendChannel = MetaChannel | 'whatsapp';

export interface UploadedAudio {
  path: string;
  mimetype?: string;
  originalname?: string;
}

@Injectable()
export class AudioLibraryService {
  private readonly logger = new Logger(AudioLibraryService.name);

  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    private readonly uploadService: UploadService,
    private readonly whatsappService: WhatsAppService,
    private readonly metaMessagingService: MetaMessagingService,
  ) {}

  private getLibrary(workspace: Workspace): WorkspaceAudioTemplate[] {
    const raw = (workspace.settings as any)?.audioLibrary;
    return Array.isArray(raw) ? (raw as WorkspaceAudioTemplate[]) : [];
  }

  private async loadWorkspace(workspaceId: string): Promise<Workspace> {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    return workspace;
  }

  private async saveLibrary(workspace: Workspace, library: WorkspaceAudioTemplate[]): Promise<void> {
    // Reassign the whole settings object so TypeORM detects the JSONB change.
    workspace.settings = { ...(workspace.settings || ({} as any)), audioLibrary: library };
    await this.workspaceRepository.save(workspace);
  }

  async list(workspaceId: string): Promise<WorkspaceAudioTemplate[]> {
    const workspace = await this.loadWorkspace(workspaceId);
    return this.getLibrary(workspace);
  }

  async create(workspaceId: string, name: string, file: UploadedAudio): Promise<WorkspaceAudioTemplate> {
    const workspace = await this.loadWorkspace(workspaceId);
    const library = this.getLibrary(workspace);

    if (library.length >= AUDIO_LIBRARY_MAX) {
      throw new BadRequestException(
        `Audio library is full (max ${AUDIO_LIBRARY_MAX}). Delete one before adding a new clip.`,
      );
    }

    const mimeType = String(file.mimetype || 'audio/mpeg').trim().toLowerCase();
    if (!mimeType.startsWith('audio/')) {
      throw new BadRequestException('Uploaded file must be an audio clip');
    }

    let buffer: Buffer;
    try {
      buffer = await fs.readFile(file.path);
    } catch (err: any) {
      throw new BadRequestException(`Could not read uploaded audio: ${err?.message || err}`);
    }

    const saved = await this.uploadService.saveBufferToStorage(
      buffer,
      mimeType,
      file.originalname || 'audio.mp3',
      'audio-library',
    );

    const template: WorkspaceAudioTemplate = {
      id: randomUUID(),
      name: String(name || '').trim() || `Audio ${new Date().toISOString().slice(0, 10)}`,
      url: saved.url,
      mimeType,
      sizeBytes: buffer.length,
      createdAt: new Date().toISOString(),
    };

    await this.saveLibrary(workspace, [...library, template]);

    // Best-effort temp cleanup; the durable copy is already in R2/storage.
    fs.unlink(file.path).catch(() => undefined);

    return template;
  }

  async delete(workspaceId: string, id: string): Promise<{ success: boolean }> {
    const workspace = await this.loadWorkspace(workspaceId);
    const library = this.getLibrary(workspace);
    const next = library.filter((item) => item.id !== id);
    if (next.length === library.length) {
      throw new NotFoundException('Audio template not found');
    }
    await this.saveLibrary(workspace, next);
    return { success: true };
  }

  async send(
    workspaceId: string,
    userId: string,
    id: string,
    body: { channel: AudioSendChannel; to: string; integrationId?: string; simulate?: boolean },
  ): Promise<any> {
    const to = String(body.to || '').trim();
    if (!to) {
      throw new BadRequestException('Recipient (to) is required');
    }

    const workspace = await this.loadWorkspace(workspaceId);
    const template = this.getLibrary(workspace).find((item) => item.id === id);
    if (!template) {
      throw new NotFoundException('Audio template not found');
    }

    if (body.channel === 'whatsapp') {
      const result = await this.whatsappService.sendMessageForWorkspace(
        workspaceId,
        {
          to,
          type: 'audio',
          content: '',
          media: { url: template.url, voice: true },
        },
        body.integrationId,
      );
      return { channel: 'whatsapp', templateId: id, ...result };
    }

    // Messenger / Instagram — Meta accepts audio by URL directly.
    return this.metaMessagingService.sendAudioMessage(workspaceId, userId, {
      channel: body.channel,
      to,
      audioUrl: template.url,
      attachmentName: template.name,
      integrationId: body.integrationId,
      simulate: body.simulate,
    });
  }
}
