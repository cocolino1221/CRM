import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace, WorkspaceSettings } from '../database/entities/workspace.entity';
import {
  DEFAULT_KPI_CONFIG,
  KPI_DEFINITIONS,
  KpiConfig,
  isKpiKey,
} from '../common/kpi-definitions';

export interface LeadGrace {
  typeform: number;
  woocommerce: number;
  manual: number;
}

/**
 * Ten minutes for the two self-service sources: long enough for someone who
 * just bought to pick a slot, short enough that a real lead is not left
 * cooling. A lead typed in by hand waits for nobody.
 */
export const DEFAULT_LEAD_GRACE: LeadGrace = { typeform: 10, woocommerce: 10, manual: 0 };

@Injectable()
export class WorkspacesService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
  ) {}

  /**
   * Persist (or clear) the workspace's custom logo URL, shown by the mobile app
   * instead of the default EasyTeam logo. Merges into the existing JSONB
   * `settings` blob so other keys (timezone, currency, features, audioLibrary,
   * etc.) are preserved. The actual image upload happens via the existing
   * `/upload` endpoint — this only stores the resulting URL.
   */
  async setBranding(
    workspaceId: string,
    brandLogoUrl: string | null,
  ): Promise<WorkspaceSettings> {
    const workspace = await this.workspaceRepository.findOne({
      where: { id: workspaceId },
    });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    workspace.settings = {
      ...(workspace.settings || ({} as WorkspaceSettings)),
      brandLogoUrl: brandLogoUrl || undefined,
    };

    await this.workspaceRepository.save(workspace);
    return workspace.settings;
  }
  /**
   * Which KPIs this workspace's reports show, and the daily target for each.
   *
   * Stored in the settings blob rather than its own table: it is one small
   * object per workspace, read on every report load and written rarely.
   */
  async getKpiConfig(workspaceId: string): Promise<KpiConfig> {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const stored = (workspace.settings as any)?.kpis;
    if (!stored || typeof stored !== 'object' || !Array.isArray(stored.enabled)) {
      // Never configured, or configured by an older shape. A default beats an
      // empty report.
      return DEFAULT_KPI_CONFIG;
    }

    return {
      enabled: stored.enabled.filter(isKpiKey),
      targets: stored.targets && typeof stored.targets === 'object' ? stored.targets : {},
    };
  }

  async setKpiConfig(workspaceId: string, config: KpiConfig): Promise<KpiConfig> {
    const enabled = Array.from(new Set(config?.enabled ?? []));

    if (!enabled.length) {
      throw new BadRequestException('Choose at least one KPI');
    }
    const unknown = enabled.filter((key) => !isKpiKey(key));
    if (unknown.length) {
      throw new BadRequestException(`Unknown KPI: ${unknown.join(', ')}`);
    }

    const targets: Record<string, number> = {};
    for (const [key, value] of Object.entries(config?.targets ?? {})) {
      if (!isKpiKey(key)) {
        throw new BadRequestException(`Unknown KPI: ${key}`);
      }
      // A negative or non-numeric target renders as a broken progress bar
      // rather than an error, so it is refused here.
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        const label = KPI_DEFINITIONS.find((k) => k.key === key)?.label ?? key;
        throw new BadRequestException(`Target for ${label} must be a positive number`);
      }
      targets[key] = value;
    }

    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // Merge: settings is one JSON blob holding timezone, currency, features and
    // billing. Replacing it would destroy all of them.
    workspace.settings = {
      ...(workspace.settings || ({} as WorkspaceSettings)),
      kpis: { enabled, targets },
    } as WorkspaceSettings;

    await this.workspaceRepository.save(workspace);
    return { enabled, targets };
  }

  /** The per-source wait before a fresh lead reaches "De sunat", in minutes. */
  async getLeadGrace(workspaceId: string): Promise<LeadGrace> {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }
    const grace = workspace.settings?.leadGrace ?? {};
    return {
      typeform: grace.typeform ?? DEFAULT_LEAD_GRACE.typeform,
      woocommerce: grace.woocommerce ?? DEFAULT_LEAD_GRACE.woocommerce,
      manual: grace.manual ?? DEFAULT_LEAD_GRACE.manual,
    };
  }

  async setLeadGrace(workspaceId: string, body: Partial<LeadGrace>): Promise<LeadGrace> {
    const clean: LeadGrace = { ...DEFAULT_LEAD_GRACE };
    for (const key of Object.keys(DEFAULT_LEAD_GRACE) as (keyof LeadGrace)[]) {
      const value = body?.[key];
      if (value === undefined || value === null) continue;
      // A negative wait would read as "arrived in the future" and hide every
      // lead from that source for good; hours of silence is not a setting
      // anyone means to make either.
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1440) {
        throw new BadRequestException(`${key}: wait must be between 0 and 1440 minutes`);
      }
      clean[key] = value;
    }

    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    workspace.settings = {
      ...(workspace.settings || ({} as WorkspaceSettings)),
      leadGrace: clean,
    } as WorkspaceSettings;

    await this.workspaceRepository.save(workspace);
    return clean;
  }
}
