import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { HttpService } from '@nestjs/axios';
import { Integration, IntegrationType, IntegrationStatus } from '../../database/entities/integration.entity';
import { Document } from '../../database/entities/document.entity';
import { GoogleIntegrationHandler } from '../handlers/google.handler';

// Backs up CRM documents (signed contracts, invoices, generated PDFs) into a
// Google Drive folder chosen by the workspace admin. Each document remembers
// its Drive file id in metadata.driveBackup so nothing uploads twice.

export interface DriveBackupConfig {
  enabled: boolean;
  folderId: string;
  folderName?: string;
  lastRunAt?: string;
  lastResult?: { uploaded: number; skipped: number; error?: string };
}

@Injectable()
export class GoogleDriveBackupService {
  private readonly logger = new Logger(GoogleDriveBackupService.name);
  private running = new Set<string>();

  constructor(
    @InjectRepository(Integration) private readonly integrationRepository: Repository<Integration>,
    @InjectRepository(Document) private readonly documentRepository: Repository<Document>,
    private readonly googleHandler: GoogleIntegrationHandler,
    private readonly httpService: HttpService,
  ) {}

  private async getGoogleIntegration(workspaceId: string): Promise<Integration> {
    const integration = await this.integrationRepository.findOne({
      where: { workspaceId, type: IntegrationType.GOOGLE },
      order: { createdAt: 'DESC' },
    });
    if (!integration || integration.status === IntegrationStatus.DISABLED) {
      throw new NotFoundException('Connect Google first to use Drive backup');
    }
    return integration;
  }

  private getConfig(integration: Integration): DriveBackupConfig | null {
    const cfg = (integration.config as any)?.driveBackup;
    return cfg?.folderId ? cfg : null;
  }

  async listFolders(workspaceId: string) {
    const integration = await this.getGoogleIntegration(workspaceId);
    return this.googleHandler.listFolders(integration.credentials?.accessToken);
  }

  async getBackupConfig(workspaceId: string) {
    const integration = await this.getGoogleIntegration(workspaceId);
    return { config: this.getConfig(integration) };
  }

  async saveBackupConfig(workspaceId: string, dto: Partial<DriveBackupConfig> & { createFolderName?: string }) {
    const integration = await this.getGoogleIntegration(workspaceId);

    let folderId = dto.folderId;
    let folderName = dto.folderName;
    if (!folderId && dto.createFolderName) {
      const created = await this.googleHandler.createDriveFolder(integration, dto.createFolderName);
      folderId = created?.id;
      folderName = created?.name;
    }
    if (!folderId) throw new BadRequestException('Pick a Drive folder or provide createFolderName');

    const config: DriveBackupConfig = {
      enabled: dto.enabled !== false,
      folderId,
      folderName,
      lastRunAt: this.getConfig(integration)?.lastRunAt,
    };
    integration.config = { ...(integration.config as any), driveBackup: config };
    await this.integrationRepository.save(integration);
    return { config };
  }

  async backupNow(workspaceId: string) {
    const integration = await this.getGoogleIntegration(workspaceId);
    const config = this.getConfig(integration);
    if (!config) throw new BadRequestException('Drive backup is not configured yet');
    return this.runBackup(integration, config);
  }

  /** Auto backup every 30 minutes for enabled workspaces. */
  @Interval(30 * 60 * 1000)
  async scheduledBackup() {
    const integrations = await this.integrationRepository
      .createQueryBuilder('integration')
      .where('integration.type = :type', { type: IntegrationType.GOOGLE })
      .andWhere("integration.config -> 'driveBackup' ->> 'enabled' = 'true'")
      .getMany();

    for (const integration of integrations) {
      const config = this.getConfig(integration);
      if (!config?.enabled) continue;
      try {
        await this.runBackup(integration, config);
      } catch (error) {
        this.logger.warn(`Scheduled Drive backup failed ws=${integration.workspaceId}: ${error.message}`);
      }
    }
  }

  // Documents keep their files as URLs inside metadata (provider-specific
  // keys) — collect every plausible one.
  private extractFileUrl(document: Document): string | null {
    const m: any = document.metadata || {};
    const candidates = [
      m.signedFileUrl, m.fileUrl, m.pdfUrl, m.documentUrl,
      m.data?.fileUrl, m.data?.pdfUrl, m.file?.url,
    ];
    const url = candidates.find((u) => typeof u === 'string' && /^https?:\/\//.test(u));
    return url || null;
  }

  private async runBackup(integration: Integration, config: DriveBackupConfig) {
    if (this.running.has(integration.id)) return { skipped: true };
    this.running.add(integration.id);
    try {
      const result = { uploaded: 0, skipped: 0, error: undefined as string | undefined };

      const documents = await this.documentRepository
        .createQueryBuilder('document')
        .where('document.workspaceId = :workspaceId', { workspaceId: integration.workspaceId })
        .andWhere("(document.metadata -> 'driveBackup') IS NULL")
        .orderBy('document.createdAt', 'DESC')
        .take(50) // per run — keeps each pass fast and inside API quotas
        .getMany();

      for (const document of documents) {
        const url = this.extractFileUrl(document);
        if (!url) { result.skipped++; continue; }

        try {
          const response = await this.httpService.axiosRef.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000,
            maxContentLength: 32 * 1024 * 1024,
          });
          const mimeType = String(response.headers?.['content-type'] || 'application/pdf').split(';')[0];
          const ext = mimeType.includes('pdf') ? '.pdf' : '';
          const safeName = `${document.name || 'document'}-${document.id.slice(0, 8)}${ext}`.replace(/[\\/:*?"<>|]/g, '_');

          const uploaded = await this.googleHandler.uploadFileToDrive(integration, {
            name: safeName,
            mimeType,
            data: Buffer.from(response.data),
            parentId: config.folderId,
          });

          document.metadata = {
            ...(document.metadata as any || {}),
            driveBackup: { fileId: uploaded?.id, link: uploaded?.webViewLink, at: new Date().toISOString() },
          };
          await this.documentRepository.save(document);
          result.uploaded++;
        } catch (error) {
          this.logger.warn(`Drive backup: doc ${document.id} failed: ${error.message}`);
          result.skipped++;
        }
      }

      config.lastRunAt = new Date().toISOString();
      config.lastResult = result;
      integration.config = { ...(integration.config as any), driveBackup: config };
      await this.integrationRepository.save(integration);
      this.logger.log(`Drive backup ws=${integration.workspaceId}: uploaded=${result.uploaded} skipped=${result.skipped}`);
      return result;
    } finally {
      this.running.delete(integration.id);
    }
  }
}
