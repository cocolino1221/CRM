import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Integration } from '../../database/entities/integration.entity';
import { Contact } from '../../database/entities/contact.entity';
import { Deal } from '../../database/entities/deal.entity';
import { Task } from '../../database/entities/task.entity';
import { Activity } from '../../database/entities/activity.entity';
import { Company } from '../../database/entities/company.entity';
import { IntegrationRegistry } from '../registry/integration.registry';

export interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  recordsCreated: number;
  recordsUpdated: number;
  recordsSkipped: number;
  errors: string[];
  duration: number;
  nextSync?: Date;
}

export interface SyncOptions {
  direction?: 'inbound' | 'outbound' | 'bidirectional';
  entities?: string[];
  force?: boolean;
  dryRun?: boolean;
}

interface IntegrationFeatures {
  contacts?: boolean;
  companies?: boolean;
  deals?: boolean;
  tasks?: boolean;
  activities?: boolean;
  calendar?: boolean;
  email?: boolean;
  messaging?: boolean;
  files?: boolean;
  analytics?: boolean;
}

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectRepository(Integration)
    private integrationRepository: Repository<Integration>,
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
    @InjectRepository(Company)
    private companyRepository: Repository<Company>,
    @InjectRepository(Deal)
    private dealRepository: Repository<Deal>,
    @InjectRepository(Task)
    private taskRepository: Repository<Task>,
    @InjectRepository(Activity)
    private activityRepository: Repository<Activity>,
    private eventEmitter: EventEmitter2,
    private integrationRegistry: IntegrationRegistry,
  ) {}

  /**
   * Sync integration data
   */
  async syncIntegration(integration: Integration, options: SyncOptions = {}): Promise<SyncResult> {
    const startTime = Date.now();
    const result: SyncResult = {
      success: false,
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      errors: [],
      duration: 0,
    };

    try {
      this.logger.log(`Starting sync for integration ${integration.id} (${integration.type})`);

      // Get integration handler
      const handler = this.integrationRegistry.getIntegrationHandler(integration.type);

      if (!handler?.syncData) {
        throw new Error(`Sync not supported for integration type: ${integration.type}`);
      }

      // Determine sync direction
      const direction = options.direction || integration.config?.syncDirection || 'bidirectional';

      // Determine entities to sync
      const entities = options.entities || this.getEnabledEntities(integration);

      // Perform sync for each entity
      for (const entity of entities) {
        try {
          if (direction === 'inbound' || direction === 'bidirectional') {
            const inboundResult = await this.syncEntityInbound(integration, entity, handler, options);
            this.mergeResults(result, inboundResult);
          }

          if (direction === 'outbound' || direction === 'bidirectional') {
            const outboundResult = await this.syncEntityOutbound(integration, entity, handler, options);
            this.mergeResults(result, outboundResult);
          }
        } catch (error) {
          this.logger.error(`Entity sync failed for ${entity}:`, error);
          result.errors.push(`${entity}: ${error.message}`);
        }
      }

      result.success = result.errors.length === 0;
      result.duration = Date.now() - startTime;

      // Schedule next sync if auto-sync is enabled
      if (integration.config?.autoSync && integration.config?.syncFrequency !== 'manual') {
        result.nextSync = this.calculateNextSync(integration.config.syncFrequency);
      }

      this.logger.log(
        `Sync completed for integration ${integration.id}: ${result.recordsProcessed} processed, ` +
        `${result.recordsCreated} created, ${result.recordsUpdated} updated, ` +
        `${result.recordsSkipped} skipped, ${result.errors.length} errors`
      );

      return result;
    } catch (error) {
      result.success = false;
      result.errors.push(error.message);
      result.duration = Date.now() - startTime;

      this.logger.error(`Sync failed for integration ${integration.id}:`, error);

      return result;
    }
  }

  /**
   * Sync entity data from external source to CRM (inbound)
   */
  private async syncEntityInbound(
    integration: Integration,
    entity: string,
    handler: any,
    options: SyncOptions,
  ): Promise<Partial<SyncResult>> {
    const result: Partial<SyncResult> = {
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      errors: [],
    };

    try {
      // Get data from external source
      const externalData = await handler.syncData(integration, {
        direction: 'inbound',
        entity,
        ...options,
      });

      if (!externalData?.records) {
        return result;
      }

      // Process each record
      for (const externalRecord of externalData.records) {
        try {
          result.recordsProcessed++;

          const mappedData = this.mapExternalDataToEntity(
            integration,
            entity,
            externalRecord,
          );

          if (!mappedData) {
            result.recordsSkipped++;
            continue;
          }

          // Check if record already exists
          const existingRecord = await this.findExistingRecord(
            integration,
            entity,
            externalRecord,
          );

          if (options.dryRun) {
            result.recordsSkipped++;
            continue;
          }

          if (existingRecord) {
            // Update existing record
            Object.assign(existingRecord, mappedData);
            await this.saveRecord(entity, existingRecord);
            result.recordsUpdated++;
          } else {
            // Create new record
            const newRecord = await this.createRecord(entity, {
              ...mappedData,
              workspaceId: integration.workspaceId,
            });
            result.recordsCreated++;
          }
        } catch (error) {
          this.logger.error(`Failed to process record:`, error);
          result.errors?.push(`Record processing error: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Inbound sync failed for entity ${entity}:`, error);
      result.errors?.push(`Inbound sync error: ${error.message}`);
    }

    return result;
  }

  /**
   * Sync entity data from CRM to external source (outbound)
   */
  private async syncEntityOutbound(
    integration: Integration,
    entity: string,
    handler: any,
    options: SyncOptions,
  ): Promise<Partial<SyncResult>> {
    const result: Partial<SyncResult> = {
      recordsProcessed: 0,
      recordsCreated: 0,
      recordsUpdated: 0,
      recordsSkipped: 0,
      errors: [],
    };

    try {
      // Get records from CRM
      const crmRecords = await this.getCRMRecords(integration, entity);

      if (!crmRecords.length) {
        return result;
      }

      // Process each record
      for (const crmRecord of crmRecords) {
        try {
          result.recordsProcessed++;

          const mappedData = this.mapCRMDataToExternal(
            integration,
            entity,
            crmRecord,
          );

          if (!mappedData) {
            result.recordsSkipped++;
            continue;
          }

          if (options.dryRun) {
            result.recordsSkipped++;
            continue;
          }

          // Send to external system
          const syncResult = await handler.syncData(integration, {
            direction: 'outbound',
            entity,
            record: mappedData,
            ...options,
          });

          if (syncResult.created) {
            result.recordsCreated++;
          } else if (syncResult.updated) {
            result.recordsUpdated++;
          } else {
            result.recordsSkipped++;
          }
        } catch (error) {
          this.logger.error(`Failed to sync record to external system:`, error);
          result.errors?.push(`Outbound sync error: ${error.message}`);
        }
      }
    } catch (error) {
      this.logger.error(`Outbound sync failed for entity ${entity}:`, error);
      result.errors?.push(`Outbound sync error: ${error.message}`);
    }

    return result;
  }

  /**
   * Get enabled entities for sync
   */
  private getEnabledEntities(integration: Integration): string[] {
    const features: IntegrationFeatures = integration.config?.features || {};
    const entities: string[] = [];

    if (features.contacts) entities.push('contacts');
    if (features.companies) entities.push('companies');
    if (features.deals) entities.push('deals');
    if (features.tasks) entities.push('tasks');
    if (features.activities) entities.push('activities');

    return entities.length > 0 ? entities : ['contacts']; // Default to contacts
  }

  /**
   * Map external data to CRM entity format
   */
  private mapExternalDataToEntity(
    integration: Integration,
    entity: string,
    externalData: any,
  ): any {
    const fieldMapping = integration.config?.fieldMapping || {};

    switch (entity) {
      case 'contacts':
        return {
          firstName: this.mapField(externalData, fieldMapping, 'contact.firstName', 'firstName', 'first_name'),
          lastName: this.mapField(externalData, fieldMapping, 'contact.lastName', 'lastName', 'last_name'),
          email: this.mapField(externalData, fieldMapping, 'contact.email', 'email', 'email_address'),
          phone: this.mapField(externalData, fieldMapping, 'contact.phone', 'phone', 'phone_number'),
          jobTitle: this.mapField(externalData, fieldMapping, 'contact.jobTitle', 'jobTitle', 'job_title', 'title'),
        };

      case 'companies':
        return {
          name: this.mapField(externalData, fieldMapping, 'company.name', 'name', 'company_name'),
          domain: this.mapField(externalData, fieldMapping, 'company.domain', 'domain', 'website_domain'),
          website: this.mapField(externalData, fieldMapping, 'company.website', 'website', 'url'),
          phone: this.mapField(externalData, fieldMapping, 'company.phone', 'phone', 'phone_number'),
          description: this.mapField(externalData, fieldMapping, 'company.description', 'description', 'about'),
        };

      case 'deals':
        return {
          title: this.mapField(externalData, fieldMapping, 'deal.title', 'title', 'name', 'deal_name'),
          value: this.mapField(externalData, fieldMapping, 'deal.value', 'value', 'amount', 'deal_value'),
          currency: this.mapField(externalData, fieldMapping, 'deal.currency', 'currency') || 'USD',
          stage: this.mapField(externalData, fieldMapping, 'deal.stage', 'stage', 'deal_stage'),
          probability: this.mapField(externalData, fieldMapping, 'deal.probability', 'probability', 'close_probability'),
          expectedCloseDate: this.mapField(externalData, fieldMapping, 'deal.expectedCloseDate', 'expectedCloseDate', 'close_date'),
        };

      default:
        return externalData;
    }
  }

  /**
   * Map field using field mapping configuration
   */
  private mapField(data: any, fieldMapping: Record<string, string>, mappingKey: string, ...fallbackKeys: string[]): any {
    // Check if there's a custom mapping
    if (fieldMapping[mappingKey]) {
      return data[fieldMapping[mappingKey]];
    }

    // Try fallback keys
    for (const key of fallbackKeys) {
      if (data[key] !== undefined) {
        return data[key];
      }
    }

    return undefined;
  }

  /**
   * Map CRM data to external format
   */
  private mapCRMDataToExternal(
    integration: Integration,
    entity: string,
    crmData: any,
  ): any {
    // Reverse the field mapping for outbound sync
    const fieldMapping = integration.config?.fieldMapping || {};
    const reverseMapping: Record<string, string> = {};

    Object.entries(fieldMapping).forEach(([key, value]) => {
      reverseMapping[value] = key;
    });

    // Transform CRM data based on integration requirements
    return crmData;
  }

  /**
   * Find existing record by external ID or unique fields
   */
  private async findExistingRecord(
    integration: Integration,
    entity: string,
    externalData: any,
  ): Promise<any> {
    const repository = this.getRepository(entity);
    const workspaceId = integration.workspaceId;

    switch (entity) {
      case 'contacts':
        return repository.findOne({
          where: [
            { email: externalData.email, workspaceId },
            { externalId: externalData.id, workspaceId },
          ],
        });

      case 'companies':
        return repository.findOne({
          where: [
            { domain: externalData.domain, workspaceId },
            { name: externalData.name, workspaceId },
            { externalId: externalData.id, workspaceId },
          ],
        });

      default:
        return repository.findOne({
          where: { externalId: externalData.id, workspaceId },
        });
    }
  }

  /**
   * Get CRM records for outbound sync
   */
  private async getCRMRecords(integration: Integration, entity: string): Promise<any[]> {
    const repository = this.getRepository(entity);
    const workspaceId = integration.workspaceId;

    // Get records modified since last sync
    const since = integration.lastSync?.timestamp || new Date(0);

    return repository.find({
      where: {
        workspaceId,
        updatedAt: { $gte: since } as any,
      },
      take: 1000, // Limit batch size
    });
  }

  /**
   * Get repository for entity
   */
  private getRepository(entity: string): Repository<any> {
    switch (entity) {
      case 'contacts':
        return this.contactRepository;
      case 'companies':
        return this.companyRepository;
      case 'deals':
        return this.dealRepository;
      case 'tasks':
        return this.taskRepository;
      case 'activities':
        return this.activityRepository;
      default:
        throw new Error(`Unknown entity: ${entity}`);
    }
  }

  /**
   * Create new record
   */
  private async createRecord(entity: string, data: any): Promise<any> {
    const repository = this.getRepository(entity);
    const record = repository.create(data);
    return repository.save(record);
  }

  /**
   * Save existing record
   */
  private async saveRecord(entity: string, record: any): Promise<any> {
    const repository = this.getRepository(entity);
    return repository.save(record);
  }

  /**
   * Merge sync results
   */
  private mergeResults(target: SyncResult, source: Partial<SyncResult>): void {
    target.recordsProcessed += source.recordsProcessed || 0;
    target.recordsCreated += source.recordsCreated || 0;
    target.recordsUpdated += source.recordsUpdated || 0;
    target.recordsSkipped += source.recordsSkipped || 0;
    target.errors.push(...(source.errors || []));
  }

  /**
   * Calculate next sync time based on frequency
   */
  private calculateNextSync(frequency: string): Date {
    const now = new Date();

    switch (frequency) {
      case 'hourly':
        return new Date(now.getTime() + 60 * 60 * 1000);
      case 'daily':
        return new Date(now.getTime() + 24 * 60 * 60 * 1000);
      case 'weekly':
        return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      default:
        return new Date(now.getTime() + 60 * 60 * 1000); // Default to hourly
    }
  }
}