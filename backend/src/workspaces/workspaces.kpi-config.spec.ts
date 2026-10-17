import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { Workspace } from '../database/entities/workspace.entity';
import { DEFAULT_KPI_CONFIG } from '../common/kpi-definitions';

const WORKSPACE = 'workspace-1';

function build(settings: any) {
  const workspace: any = { id: WORKSPACE, settings };
  const repo = {
    findOne: jest.fn().mockResolvedValue(workspace),
    save: jest.fn().mockImplementation((w: any) => Promise.resolve(w)),
  };
  return { workspace, repo };
}

async function serviceWith(repo: any): Promise<WorkspacesService> {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      WorkspacesService,
      { provide: getRepositoryToken(Workspace), useValue: repo },
    ],
  }).compile();
  return module.get(WorkspacesService);
}

describe('WorkspacesService — KPI config', () => {
  describe('getKpiConfig', () => {
    it('hands back a usable default for a workspace that never configured it', async () => {
      const { repo } = build({ timezone: 'Europe/Bucharest' });
      const service = await serviceWith(repo);

      await expect(service.getKpiConfig(WORKSPACE)).resolves.toEqual(DEFAULT_KPI_CONFIG);
    });

    it('hands back what was stored', async () => {
      const stored = { enabled: ['callsMade'], targets: { callsMade: 40 } };
      const { repo } = build({ timezone: 'Europe/Bucharest', kpis: stored });
      const service = await serviceWith(repo);

      await expect(service.getKpiConfig(WORKSPACE)).resolves.toEqual(stored);
    });

    it('falls back to the default when the stored value is unusable', async () => {
      const { repo } = build({ kpis: 'nonsense' });
      const service = await serviceWith(repo);

      await expect(service.getKpiConfig(WORKSPACE)).resolves.toEqual(DEFAULT_KPI_CONFIG);
    });

    it('refuses a workspace that does not exist', async () => {
      const repo = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn() };
      const service = await serviceWith(repo);

      await expect(service.getKpiConfig(WORKSPACE)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setKpiConfig', () => {
    // The settings column is one JSON blob. A write that replaces it instead of
    // merging silently destroys the workspace's timezone, billing and features
    // — the same shape of bug that wiped eight Typeform fields once.
    it('keeps every other settings key', async () => {
      const { repo } = build({
        timezone: 'Europe/Bucharest',
        currency: 'RON',
        features: { whatsapp: true },
        billing: { package: 'growth' },
      });
      const service = await serviceWith(repo);

      await service.setKpiConfig(WORKSPACE, { enabled: ['callsMade'], targets: { callsMade: 40 } });

      const saved = repo.save.mock.calls[0][0].settings;
      expect(saved.timezone).toBe('Europe/Bucharest');
      expect(saved.currency).toBe('RON');
      expect(saved.features).toEqual({ whatsapp: true });
      expect(saved.billing).toEqual({ package: 'growth' });
      expect(saved.kpis).toEqual({ enabled: ['callsMade'], targets: { callsMade: 40 } });
    });

    it('returns the stored config', async () => {
      const { repo } = build({});
      const service = await serviceWith(repo);

      await expect(
        service.setKpiConfig(WORKSPACE, { enabled: ['revenue'], targets: {} }),
      ).resolves.toEqual({ enabled: ['revenue'], targets: {} });
    });

    it('rejects a KPI key the reports cannot compute', async () => {
      const { repo } = build({});
      const service = await serviceWith(repo);

      await expect(
        service.setKpiConfig(WORKSPACE, { enabled: ['vibes'], targets: {} }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a target on a KPI that does not exist', async () => {
      const { repo } = build({});
      const service = await serviceWith(repo);

      await expect(
        service.setKpiConfig(WORKSPACE, { enabled: ['callsMade'], targets: { vibes: 10 } }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    // A target of -5 or "forty" would render as a broken progress bar rather
    // than an error, so it is refused at the door.
    it('rejects a target that is not a positive number', async () => {
      const { repo } = build({});
      const service = await serviceWith(repo);

      for (const bad of [-5, 0, Number.NaN, 'forty' as any, null as any]) {
        await expect(
          service.setKpiConfig(WORKSPACE, { enabled: ['callsMade'], targets: { callsMade: bad } }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    });

    it('rejects an empty KPI list, which would render an empty report', async () => {
      const { repo } = build({});
      const service = await serviceWith(repo);

      await expect(
        service.setKpiConfig(WORKSPACE, { enabled: [], targets: {} }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('drops a duplicated KPI rather than rendering the card twice', async () => {
      const { repo } = build({});
      const service = await serviceWith(repo);

      const result = await service.setKpiConfig(WORKSPACE, {
        enabled: ['callsMade', 'callsMade', 'revenue'],
        targets: {},
      });

      expect(result.enabled).toEqual(['callsMade', 'revenue']);
    });
  });
});
