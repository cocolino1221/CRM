import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { Integration, IntegrationType, IntegrationStatus } from '../../database/entities/integration.entity';
import { Contact, ContactSource } from '../../database/entities/contact.entity';
import { PipelineStage } from '../../database/entities/pipeline-stage.entity';
import { GoogleIntegrationHandler } from '../handlers/google.handler';

// CRM fields a sheet column can map to. "stage" moves the contact between
// pipeline stages by stage NAME. Keys are stored in integration.config.
export const MAPPABLE_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'company', 'source', 'notes', 'stage'] as const;
export type MappableField = (typeof MAPPABLE_FIELDS)[number];

export interface SheetsSyncConfig {
  enabled: boolean;
  spreadsheetId: string;
  spreadsheetName?: string;
  sheetName: string; // tab title
  // CRM field -> exact header text in the sheet's first row
  mapping: Partial<Record<MappableField, string>>;
  pipelineId?: string;
  pipelineStageId?: string; // default stage for new rows
  direction: 'two-way' | 'sheet-to-crm' | 'crm-to-sheet';
  lastSyncAt?: string;
  lastResult?: { fromSheet: number; toSheet: number; skipped: number; error?: string };
}

const CRM_ID_HEADER = 'CRM ID';

function columnLetter(index: number): string {
  let s = '';
  let n = index;
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

@Injectable()
export class GoogleSheetsService {
  private readonly logger = new Logger(GoogleSheetsService.name);
  private syncing = new Set<string>();

  constructor(
    @InjectRepository(Integration) private readonly integrationRepository: Repository<Integration>,
    @InjectRepository(Contact) private readonly contactRepository: Repository<Contact>,
    @InjectRepository(PipelineStage) private readonly stageRepository: Repository<PipelineStage>,
    private readonly googleHandler: GoogleIntegrationHandler,
  ) {}

  private async getGoogleIntegration(workspaceId: string): Promise<Integration> {
    const integration = await this.integrationRepository.findOne({
      where: { workspaceId, type: IntegrationType.GOOGLE },
      order: { createdAt: 'DESC' },
    });
    if (!integration || integration.status === IntegrationStatus.DISABLED) {
      throw new NotFoundException('Connect Google first (Integrations page) to use Sheets sync');
    }
    return integration;
  }

  private getConfig(integration: Integration): SheetsSyncConfig | null {
    const cfg = (integration.config as any)?.sheetsSync;
    return cfg?.spreadsheetId ? cfg : null;
  }

  // ── configuration surface (backs the mapping UI) ──

  async listSpreadsheets(workspaceId: string) {
    const integration = await this.getGoogleIntegration(workspaceId);
    return this.googleHandler.listSheets(integration);
  }

  async getSpreadsheetInfo(workspaceId: string, spreadsheetId: string) {
    const integration = await this.getGoogleIntegration(workspaceId);
    const meta = await this.googleHandler.getSpreadsheetMetadata(integration, spreadsheetId);
    const tabs: string[] = (meta?.sheets || []).map((s: any) => s?.properties?.title).filter(Boolean);

    // headers of the first (or requested) tab so the UI can offer mapping choices
    const headersByTab: Record<string, string[]> = {};
    for (const tab of tabs.slice(0, 10)) {
      try {
        const data = await this.googleHandler.getSheetData(integration, spreadsheetId, `'${tab}'!A1:AZ1`);
        headersByTab[tab] = (data.values?.[0] || []).map((h: any) => String(h ?? '').trim());
      } catch {
        headersByTab[tab] = [];
      }
    }
    return { spreadsheetId, title: meta?.properties?.title, tabs, headersByTab, mappableFields: MAPPABLE_FIELDS };
  }

  async getSyncConfig(workspaceId: string) {
    const integration = await this.getGoogleIntegration(workspaceId);
    return { config: this.getConfig(integration) };
  }

  async saveSyncConfig(workspaceId: string, dto: Partial<SheetsSyncConfig>) {
    const integration = await this.getGoogleIntegration(workspaceId);
    if (!dto.spreadsheetId || !dto.sheetName) {
      throw new BadRequestException('spreadsheetId and sheetName are required');
    }
    if (!dto.mapping || !dto.mapping.email) {
      throw new BadRequestException('Column mapping must at least include "email" — it is the matching key');
    }
    const config: SheetsSyncConfig = {
      enabled: dto.enabled !== false,
      spreadsheetId: dto.spreadsheetId,
      spreadsheetName: dto.spreadsheetName,
      sheetName: dto.sheetName,
      mapping: dto.mapping,
      pipelineId: dto.pipelineId,
      pipelineStageId: dto.pipelineStageId,
      direction: dto.direction || 'two-way',
      lastSyncAt: this.getConfig(integration)?.lastSyncAt,
    };
    integration.config = { ...(integration.config as any), sheetsSync: config };
    await this.integrationRepository.save(integration);
    return { config };
  }

  // ── sync engine ──

  async syncNow(workspaceId: string) {
    const integration = await this.getGoogleIntegration(workspaceId);
    const config = this.getConfig(integration);
    if (!config) throw new BadRequestException('Sheets sync is not configured yet');
    return this.runSync(integration, config);
  }

  /** Auto sync every 10 minutes for all enabled workspaces. */
  @Interval(10 * 60 * 1000)
  async scheduledSync() {
    const integrations = await this.integrationRepository
      .createQueryBuilder('integration')
      .where('integration.type = :type', { type: IntegrationType.GOOGLE })
      .andWhere("integration.config -> 'sheetsSync' ->> 'enabled' = 'true'")
      .getMany();

    for (const integration of integrations) {
      const config = this.getConfig(integration);
      if (!config?.enabled) continue;
      try {
        await this.runSync(integration, config);
      } catch (error) {
        this.logger.warn(`Scheduled Sheets sync failed ws=${integration.workspaceId}: ${error.message}`);
      }
    }
  }

  private async runSync(integration: Integration, config: SheetsSyncConfig) {
    if (this.syncing.has(integration.id)) {
      return { skipped: true, reason: 'sync already running' };
    }
    this.syncing.add(integration.id);
    try {
      const result = { fromSheet: 0, toSheet: 0, skipped: 0, error: undefined as string | undefined };

      // read the whole table once
      const range = `'${config.sheetName}'!A1:AZ10000`;
      const sheet = await this.googleHandler.getSheetData(integration, config.spreadsheetId, range);
      const rows: any[][] = sheet.values || [];
      let headers: string[] = (rows[0] || []).map((h: any) => String(h ?? '').trim());

      // ensure the managed CRM ID column exists (appended after the last header)
      let crmIdCol = headers.findIndex((h) => h.toLowerCase() === CRM_ID_HEADER.toLowerCase());
      if (crmIdCol === -1) {
        crmIdCol = headers.length;
        headers = [...headers, CRM_ID_HEADER];
        await this.googleHandler.updateSheetValues(
          integration,
          config.spreadsheetId,
          `'${config.sheetName}'!${columnLetter(crmIdCol)}1`,
          [[CRM_ID_HEADER]],
        );
      }

      const colOf: Partial<Record<MappableField, number>> = {};
      for (const field of MAPPABLE_FIELDS) {
        const header = config.mapping[field];
        if (!header) continue;
        const idx = headers.findIndex((h) => h.toLowerCase() === header.toLowerCase());
        if (idx !== -1) colOf[field] = idx;
      }
      if (colOf.email === undefined) {
        throw new BadRequestException(`Mapped email column "${config.mapping.email}" not found in header row`);
      }

      // stage name -> id cache for this pipeline
      const stagesByName = new Map<string, string>();
      if (config.pipelineId) {
        const stages = await this.stageRepository.find({ where: { pipelineId: config.pipelineId } });
        for (const s of stages) stagesByName.set(s.name.trim().toLowerCase(), s.id);
      }

      const idWriteBacks: Array<{ range: string; values: any[][] }> = [];
      const seenContactIds = new Set<string>();

      // ── phase 1: sheet → CRM ──
      if (config.direction !== 'crm-to-sheet') {
        for (let r = 1; r < rows.length; r++) {
          const row = rows[r] || [];
          const cell = (i?: number) => (i === undefined ? '' : String(row[i] ?? '').trim());
          const email = cell(colOf.email).toLowerCase();
          const existingId = String(row[crmIdCol] ?? '').trim();
          if (!email && !existingId) { if (row.some((v) => String(v ?? '').trim())) result.skipped++; continue; }

          let contact: Contact | null = null;
          if (existingId) {
            contact = await this.contactRepository.findOne({ where: { id: existingId, workspaceId: integration.workspaceId } });
          }
          if (!contact && email) {
            contact = await this.contactRepository.findOne({ where: { email, workspaceId: integration.workspaceId } });
          }

          const stageName = cell(colOf.stage).toLowerCase();
          const stageId = stageName ? stagesByName.get(stageName) : undefined;

          const apply = (c: Contact) => {
            if (cell(colOf.firstName)) c.firstName = cell(colOf.firstName);
            if (cell(colOf.lastName)) c.lastName = cell(colOf.lastName);
            if (cell(colOf.phone)) c.phone = cell(colOf.phone);
            if (config.pipelineId) c.pipelineId = config.pipelineId;
            if (stageId) c.pipelineStageId = stageId;
            else if (!c.pipelineStageId && config.pipelineStageId) c.pipelineStageId = config.pipelineStageId;
            const custom = { ...(c.customFields as any || {}) };
            if (cell(colOf.company)) custom.company = cell(colOf.company);
            if (cell(colOf.notes)) custom.sheetNotes = cell(colOf.notes);
            c.customFields = custom;
          };

          if (!contact) {
            if (!email) { result.skipped++; continue; }
            contact = this.contactRepository.create({
              workspaceId: integration.workspaceId,
              ownerId: integration.userId,
              email,
              firstName: cell(colOf.firstName) || email.split('@')[0],
              lastName: cell(colOf.lastName) || '-',
              source: ContactSource.OTHER,
              pipelineStageId: config.pipelineStageId,
            } as Partial<Contact>);
            apply(contact);
            contact = await this.contactRepository.save(contact);
            result.fromSheet++;
          } else {
            apply(contact);
            await this.contactRepository.save(contact);
            result.fromSheet++;
          }
          seenContactIds.add(contact.id);

          if (!existingId) {
            idWriteBacks.push({
              range: `'${config.sheetName}'!${columnLetter(crmIdCol)}${r + 1}`,
              values: [[contact.id]],
            });
          }
        }
      }

      // ── phase 2: CRM → sheet (contacts in the configured pipeline) ──
      if (config.direction !== 'sheet-to-crm' && config.pipelineId) {
        const contacts = await this.contactRepository.find({
          where: { workspaceId: integration.workspaceId, pipelineId: config.pipelineId },
          take: 5000,
        });
        const stageNameById = new Map<string, string>();
        for (const [name, id] of stagesByName.entries()) stageNameById.set(id, name);

        const rowByContactId = new Map<string, number>();
        for (let r = 1; r < rows.length; r++) {
          const id = String((rows[r] || [])[crmIdCol] ?? '').trim();
          if (id) rowByContactId.set(id, r);
        }

        const appends: any[][] = [];
        for (const contact of contacts) {
          const buildRow = (base: any[]): any[] => {
            const out = [...base];
            const set = (i: number | undefined, v: string) => { if (i !== undefined) out[i] = v; };
            set(colOf.firstName, contact.firstName || '');
            set(colOf.lastName, contact.lastName === '-' ? '' : contact.lastName || '');
            set(colOf.email, contact.email || '');
            set(colOf.phone, contact.phone || '');
            set(colOf.company, String((contact.customFields as any)?.company || ''));
            set(colOf.stage, contact.pipelineStageId ? (stageNameById.get(contact.pipelineStageId) || '') : '');
            out[crmIdCol] = contact.id;
            return out;
          };

          const rowIndex = rowByContactId.get(contact.id);
          if (rowIndex !== undefined) {
            if (seenContactIds.has(contact.id)) continue; // just imported this row — don't bounce it back
            const current = rows[rowIndex] || [];
            const updated = buildRow([...current]);
            if (JSON.stringify(updated) !== JSON.stringify(current)) {
              idWriteBacks.push({
                range: `'${config.sheetName}'!A${rowIndex + 1}:${columnLetter(Math.max(headers.length - 1, updated.length - 1))}${rowIndex + 1}`,
                values: [updated],
              });
              result.toSheet++;
            }
          } else {
            appends.push(buildRow(new Array(headers.length).fill('')));
            result.toSheet++;
          }
        }

        if (appends.length) {
          await this.googleHandler.appendSheetValues(
            integration, config.spreadsheetId, `'${config.sheetName}'!A1`, appends,
          );
        }
      }

      if (idWriteBacks.length) {
        await this.googleHandler.batchUpdateSheetValues(integration, config.spreadsheetId, idWriteBacks);
      }

      config.lastSyncAt = new Date().toISOString();
      config.lastResult = result;
      integration.config = { ...(integration.config as any), sheetsSync: config };
      await this.integrationRepository.save(integration);

      this.logger.log(
        `Sheets sync ws=${integration.workspaceId}: fromSheet=${result.fromSheet} toSheet=${result.toSheet} skipped=${result.skipped}`,
      );
      return result;
    } catch (error) {
      // Google 403 on write = token missing the spreadsheets scope.
      const status = error?.response?.status;
      const friendly =
        status === 403 || status === 401
          ? 'Google refused access to the spreadsheet. Reconnect Google and accept the Sheets permission, then try again.'
          : error.message;

      const config2 = this.getConfig(integration);
      if (config2) {
        config2.lastResult = { fromSheet: 0, toSheet: 0, skipped: 0, error: friendly };
        integration.config = { ...(integration.config as any), sheetsSync: config2 };
        await this.integrationRepository.save(integration).catch(() => undefined);
      }
      if (status === 403 || status === 401) {
        throw new BadRequestException(friendly);
      }
      throw error;
    } finally {
      this.syncing.delete(integration.id);
    }
  }
}
