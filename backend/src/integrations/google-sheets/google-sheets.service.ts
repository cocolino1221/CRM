import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { Interval } from '@nestjs/schedule';
import { Integration, IntegrationType, IntegrationStatus } from '../../database/entities/integration.entity';
import { Contact, ContactSource } from '../../database/entities/contact.entity';
import { PipelineStage } from '../../database/entities/pipeline-stage.entity';
import { GoogleIntegrationHandler } from '../handlers/google.handler';
import { normalizePhoneE164 } from '../../common/utils/phone.util';
import { NotificationsService } from '../../notifications/notifications.service';

// CRM fields a sheet column can map to. "stage" moves the contact between
// pipeline stages by stage NAME. Keys are stored in integration.config.
export const MAPPABLE_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'company', 'source', 'notes', 'stage', 'preluat'] as const;
export type MappableField = (typeof MAPPABLE_FIELDS)[number];

export interface SheetsSyncConfig {
  enabled: boolean;
  spreadsheetId: string;
  spreadsheetName?: string;
  sheetName: string; // tab title
  headerRow?: number; // 1-based row that holds the column headers (default 1)
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
    private readonly notificationsService: NotificationsService,
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

    // Headers per tab for the mapping UI. Real-world sheets often have title
    // rows above the header row, so scan the first 5 rows and pick the first
    // one that looks like a header (>= 2 non-empty cells).
    const headersByTab: Record<string, string[]> = {};
    const headerRowByTab: Record<string, number> = {};
    for (const tab of tabs.slice(0, 10)) {
      try {
        const data = await this.googleHandler.getSheetData(integration, spreadsheetId, `'${tab}'!A1:AZ5`);
        const firstRows: any[][] = data.values || [];
        let headerIdx = 0;
        for (let i = 0; i < firstRows.length; i++) {
          const nonEmpty = (firstRows[i] || []).filter((v) => String(v ?? '').trim()).length;
          if (nonEmpty >= 2) { headerIdx = i; break; }
        }
        headersByTab[tab] = (firstRows[headerIdx] || []).map((h: any) => String(h ?? '').trim());
        headerRowByTab[tab] = headerIdx + 1; // 1-based
      } catch {
        headersByTab[tab] = [];
        headerRowByTab[tab] = 1;
      }
    }
    return { spreadsheetId, title: meta?.properties?.title, tabs, headersByTab, headerRowByTab, mappableFields: MAPPABLE_FIELDS };
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
    if (!dto.mapping || (!dto.mapping.email && !dto.mapping.phone)) {
      throw new BadRequestException('Column mapping must include "email" or "phone" — one of them is the matching key');
    }
    const config: SheetsSyncConfig = {
      enabled: dto.enabled !== false,
      spreadsheetId: dto.spreadsheetId,
      spreadsheetName: dto.spreadsheetName,
      sheetName: dto.sheetName,
      headerRow: Math.max(1, Number(dto.headerRow) || 1),
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

  /**
   * Instant single-cell push for one contact/field — used by UI toggles
   * (e.g. the "Preluat" checkmark) that shouldn't wait for the next
   * periodic full sync. No-ops silently if Sheets sync isn't configured or
   * the field isn't mapped to a column; a missing row (contact not yet
   * present in the sheet) is left for the next full sync to add.
   */
  async pushContactField(workspaceId: string, contactId: string, field: MappableField, value: string): Promise<void> {
    const integration = await this.getGoogleIntegration(workspaceId).catch(() => null);
    if (!integration) return;
    const config = this.getConfig(integration);
    if (!config?.enabled) return;
    const header = config.mapping[field];
    if (!header) return;

    try {
      const range = `'${config.sheetName}'!A1:AZ10000`;
      const sheet = await this.googleHandler.getSheetData(integration, config.spreadsheetId, range);
      const rows: any[][] = sheet.values || [];
      const headerIdx = Math.max(0, (config.headerRow || 1) - 1);
      const firstDataRow = headerIdx + 1;
      const headers: string[] = (rows[headerIdx] || []).map((h: any) => String(h ?? '').trim());

      const fieldCol = headers.findIndex((h) => h.toLowerCase() === header.toLowerCase());
      const crmIdCol = headers.findIndex((h) => h.toLowerCase() === CRM_ID_HEADER.toLowerCase());
      if (fieldCol === -1 || crmIdCol === -1) return;

      for (let r = firstDataRow; r < rows.length; r++) {
        if (String((rows[r] || [])[crmIdCol] ?? '').trim() !== contactId) continue;
        await this.googleHandler.updateSheetValues(
          integration,
          config.spreadsheetId,
          `'${config.sheetName}'!${columnLetter(fieldCol)}${r + 1}`,
          [[value]],
        );
        return;
      }
    } catch (error: any) {
      this.logger.warn(`Failed to push ${field} for contact ${contactId} to sheet: ${error.message}`);
    }
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
      // Headers can live below title rows — config.headerRow is 1-based.
      const headerIdx = Math.max(0, (config.headerRow || 1) - 1);
      const firstDataRow = headerIdx + 1;
      let headers: string[] = (rows[headerIdx] || []).map((h: any) => String(h ?? '').trim());

      // Managed CRM ID column. Sheets can have data rows WIDER than the
      // header row, so "after the last header" may land on real data — only
      // trust a CRM ID column whose data cells are UUIDs/empty; otherwise
      // create it beyond the widest row.
      const isUuid = (v: string) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
      const maxRowLen = rows.reduce((m, r) => Math.max(m, (r || []).length), headers.length);

      let crmIdCol = -1;
      for (let i = 0; i < headers.length; i++) {
        if (headers[i].toLowerCase() !== CRM_ID_HEADER.toLowerCase()) continue;
        const pure = rows.slice(firstDataRow).every((r) => {
          const v = String((r || [])[i] ?? '').trim();
          return !v || isUuid(v);
        });
        if (pure) { crmIdCol = i; break; }
      }
      if (crmIdCol === -1) {
        crmIdCol = maxRowLen;
        while (headers.length < crmIdCol) headers.push('');
        headers = [...headers, CRM_ID_HEADER];
        await this.googleHandler.updateSheetValues(
          integration,
          config.spreadsheetId,
          `'${config.sheetName}'!${columnLetter(crmIdCol)}${headerIdx + 1}`,
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
      if (colOf.email === undefined && colOf.phone === undefined) {
        throw new BadRequestException('Neither the mapped email nor phone column was found in the header row');
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
        for (let r = firstDataRow; r < rows.length; r++) {
          try {
          const row = rows[r] || [];
          const cell = (i?: number) => (i === undefined ? '' : String(row[i] ?? '').trim());
          // A mapped "email" column may hold junk (lead source, notes) —
          // only trust real email addresses, otherwise match/create by phone.
          const rawEmail = cell(colOf.email).toLowerCase();
          const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail) ? rawEmail : '';
          const phone = cell(colOf.phone);
          const phoneNormalized = phone ? normalizePhoneE164(phone) : null;
          const rawId = String(row[crmIdCol] ?? '').trim();
          const existingId = isUuid(rawId) ? rawId : '';
          if (!email && !phoneNormalized && !existingId) {
            if (row.some((v) => String(v ?? '').trim())) result.skipped++;
            continue;
          }

          let contact: Contact | null = null;
          if (existingId) {
            contact = await this.contactRepository.findOne({ where: { id: existingId, workspaceId: integration.workspaceId } });
          }
          if (!contact && email) {
            contact = await this.contactRepository.findOne({ where: { email, workspaceId: integration.workspaceId } });
          }
          if (!contact && phoneNormalized) {
            contact = await this.contactRepository.findOne({
              where: { phoneNormalized, workspaceId: integration.workspaceId },
            });
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
            if (cell(colOf.preluat)) c.preluat = /^(true|1|yes|da)$/i.test(cell(colOf.preluat));
            const custom = { ...(c.customFields as any || {}) };
            if (cell(colOf.company)) custom.company = cell(colOf.company);
            if (cell(colOf.notes)) custom.sheetNotes = cell(colOf.notes);
            c.customFields = custom;
          };

          if (!contact) {
            if (!email && !phoneNormalized) { result.skipped++; continue; }
            // Contacts require an email — phone-only rows get a placeholder
            // (same pattern the WhatsApp ingest uses).
            const effectiveEmail = email || `${phoneNormalized!.replace(/[^0-9]/g, '')}@sheet.placeholder.invalid`;
            contact = this.contactRepository.create({
              workspaceId: integration.workspaceId,
              ownerId: integration.userId,
              email: effectiveEmail,
              phone: phone || undefined,
              firstName: cell(colOf.firstName) || (email ? email.split('@')[0] : phone) || '-',
              lastName: cell(colOf.lastName) || '-',
              source: ContactSource.OTHER,
              pipelineStageId: config.pipelineStageId,
            } as Partial<Contact>);
            apply(contact);
            contact = await this.contactRepository.save(contact);
            result.fromSheet++;

            // New lead from the sheet — notify (gated by the user's
            // `lead:sheets` push preference). Fire-and-forget.
            if (integration.userId) {
              const displayName = `${contact.firstName || ''} ${contact.lastName === '-' ? '' : contact.lastName || ''}`.trim()
                || contact.phone || contact.email;
              this.notificationsService
                .notifyLead(
                  integration.workspaceId,
                  integration.userId,
                  'sheets',
                  'New lead from Google Sheets',
                  `${displayName} — imported from "${config.spreadsheetName || 'sheet'}"`,
                  '/leads',
                )
                .catch(() => undefined);
            }
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
          } catch (rowError) {
            // One bad row (weird cell data, constraint hit) must not sink the
            // whole sync — count it and move on.
            this.logger.warn(`Sheets sync: row ${r + 1} skipped: ${rowError.message}`);
            result.skipped++;
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
        for (let r = firstDataRow; r < rows.length; r++) {
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
            set(colOf.preluat, contact.preluat ? 'TRUE' : 'FALSE');
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
