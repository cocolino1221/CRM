import { Processor, Process } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { QUEUE_NAMES, JOB_TYPES } from '../queue.constants';
import { ContactsService } from '../../contacts/contacts.service';

interface SyncJobData {
  workspaceId: string;
  integrationId?: string;
  syncType: 'full' | 'incremental';
  lastSyncedAt?: Date;
}

interface ExportJobData {
  workspaceId: string;
  entityType: 'contacts' | 'deals' | 'companies' | 'tasks';
  format: 'csv' | 'json' | 'xlsx';
  filters?: Record<string, any>;
}

interface ImportJobData {
  workspaceId: string;
  entityType: 'contacts' | 'deals' | 'companies';
  data: any[];
  options?: {
    skipDuplicates?: boolean;
    updateExisting?: boolean;
  };
}

interface GoogleSheetsImportJobData {
  workspaceId: string;
  userId: string;
  contacts: Array<{
    email?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    company?: string;
    title?: string;
    source?: string;
    status?: string;
    pipelineId?: string;
    pipelineStageId?: string;
    tags?: string[];
    notes?: string;
    [key: string]: any;
  }>;
  duplicateActions: Record<string, 'skip' | 'update' | 'create'>;
}

@Processor(QUEUE_NAMES.DATA_SYNC)
export class DataSyncProcessor {
  private readonly logger = new Logger(DataSyncProcessor.name);

  constructor(
    private readonly contactsService: ContactsService,
  ) {}

  @Process(JOB_TYPES.SYNC_CONTACTS)
  async handleSyncContacts(job: Job<SyncJobData>) {
    this.logger.log(`Syncing contacts for workspace ${job.data.workspaceId}`);
    const { workspaceId, syncType } = job.data;

    try {
      // TODO: Implement actual sync logic
      await new Promise(resolve => setTimeout(resolve, 2000));

      const synced = Math.floor(Math.random() * 100);
      this.logger.log(`Synced ${synced} contacts for workspace ${workspaceId}`);

      return { success: true, synced, syncType };
    } catch (error) {
      this.logger.error(`Failed to sync contacts:`, error);
      throw error;
    }
  }

  @Process(JOB_TYPES.SYNC_DEALS)
  async handleSyncDeals(job: Job<SyncJobData>) {
    this.logger.log(`Syncing deals for workspace ${job.data.workspaceId}`);
    const { workspaceId, syncType } = job.data;

    try {
      await new Promise(resolve => setTimeout(resolve, 2000));

      const synced = Math.floor(Math.random() * 50);
      this.logger.log(`Synced ${synced} deals for workspace ${workspaceId}`);

      return { success: true, synced, syncType };
    } catch (error) {
      this.logger.error(`Failed to sync deals:`, error);
      throw error;
    }
  }

  @Process(JOB_TYPES.SYNC_INTEGRATION)
  async handleSyncIntegration(job: Job<SyncJobData>) {
    this.logger.log(`Syncing integration ${job.data.integrationId} for workspace ${job.data.workspaceId}`);
    const { workspaceId, integrationId, syncType } = job.data;

    try {
      await new Promise(resolve => setTimeout(resolve, 3000));

      this.logger.log(`Integration ${integrationId} synced successfully`);

      return { success: true, workspaceId, integrationId, syncType };
    } catch (error) {
      this.logger.error(`Failed to sync integration ${integrationId}:`, error);
      throw error;
    }
  }

  @Process(JOB_TYPES.EXPORT_DATA)
  async handleExportData(job: Job<ExportJobData>) {
    this.logger.log(`Exporting ${job.data.entityType} for workspace ${job.data.workspaceId}`);
    const { workspaceId, entityType, format, filters } = job.data;

    try {
      // TODO: Implement actual export logic with ContactsService, DealsService, etc.
      await new Promise(resolve => setTimeout(resolve, 2000));

      const recordCount = Math.floor(Math.random() * 500);
      const fileUrl = `/exports/${workspaceId}/${entityType}-${Date.now()}.${format}`;

      this.logger.log(`Exported ${recordCount} ${entityType} to ${fileUrl}`);

      return { success: true, fileUrl, recordCount, format };
    } catch (error) {
      this.logger.error(`Failed to export ${entityType}:`, error);
      throw error;
    }
  }

  @Process(JOB_TYPES.IMPORT_DATA)
  async handleImportData(job: Job<ImportJobData>) {
    this.logger.log(`Importing ${job.data.entityType} for workspace ${job.data.workspaceId}`);
    const { workspaceId, entityType, data, options } = job.data;

    try {
      // TODO: Implement actual import logic
      await new Promise(resolve => setTimeout(resolve, 3000));

      const imported = Math.floor(data.length * 0.9);
      const failed = data.length - imported;

      this.logger.log(`Imported ${imported}/${data.length} ${entityType}`);

      return {
        success: true,
        imported,
        failed,
        total: data.length,
      };
    } catch (error) {
      this.logger.error(`Failed to import ${entityType}:`, error);
      throw error;
    }
  }

  @Process(JOB_TYPES.IMPORT_GOOGLE_SHEETS)
  async handleImportGoogleSheets(job: Job<GoogleSheetsImportJobData>) {
    const { workspaceId, contacts, duplicateActions } = job.data;
    const total = contacts.length;

    this.logger.log(`Processing Google Sheets import: ${total} contacts for workspace ${workspaceId}`);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: Array<{ email: string; error: string }> = [];

    try {
      // Phase 1: Categorize contacts by duplicate action
      await job.progress(10);

      const emails = contacts.map(c => c.email).filter(Boolean);
      const existingMap = await this.contactsService.findByEmails(workspaceId, emails);

      await job.progress(20);

      // Phase 2: Separate contacts into create/update/skip groups
      const toCreate: any[] = [];
      const toUpdate: Array<{ email: string; data: any }> = [];

      for (const contact of contacts) {
        if (!contact.email) {
          errors.push({ email: contact.email || 'unknown', error: 'Email is required' });
          skipped++;
          continue;
        }

        const emailLower = contact.email.toLowerCase();
        const existing = existingMap.get(emailLower);

        if (existing) {
          const action = duplicateActions[emailLower] || 'skip';

          if (action === 'update') {
            toUpdate.push({ email: emailLower, data: contact });
          } else if (action === 'create') {
            // Force create even if duplicate (will cause conflict - user chose this)
            toCreate.push({ ...contact, email: contact.email });
          } else {
            // 'skip' - default
            skipped++;
          }
        } else {
          toCreate.push(contact);
        }
      }

      await job.progress(30);

      // Phase 3: Bulk create new contacts
      if (toCreate.length > 0) {
        this.logger.log(`Creating ${toCreate.length} new contacts in batches`);
        const createResult = await this.contactsService.bulkCreate(workspaceId, toCreate, {
          skipDuplicates: true, // Skip if some still conflict at DB level
          batchSize: 100,
        });

        created += createResult.created;
        skipped += createResult.skipped;
        errors.push(...createResult.errors);
      }

      await job.progress(70);

      // Phase 4: Update existing contacts
      if (toUpdate.length > 0) {
        this.logger.log(`Updating ${toUpdate.length} existing contacts`);
        const updateResult = await this.contactsService.bulkCreate(workspaceId, toUpdate.map(u => u.data), {
          updateExisting: true,
          batchSize: 100,
        });

        updated += updateResult.updated;
        errors.push(...updateResult.errors);
      }

      await job.progress(100);

      const result = {
        success: true,
        total,
        created,
        updated,
        skipped,
        errors: errors.slice(0, 50), // Cap error list at 50 entries
        totalErrors: errors.length,
      };

      this.logger.log(
        `Google Sheets import completed: created=${created}, updated=${updated}, skipped=${skipped}, errors=${errors.length}`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Google Sheets import failed for workspace ${workspaceId}:`, error);
      throw error;
    }
  }
}
