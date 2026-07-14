import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { Workspace } from '../database/entities/workspace.entity';

// Minimal mock repository — only findOne/save are exercised by setBranding().
const createMockRepository = () => ({
  findOne: jest.fn(),
  save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
});

describe('WorkspacesService — setBranding', () => {
  let service: WorkspacesService;
  let workspaceRepository: ReturnType<typeof createMockRepository>;

  const workspaceId = 'workspace-1';

  beforeEach(async () => {
    workspaceRepository = createMockRepository();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspacesService,
        { provide: getRepositoryToken(Workspace), useValue: workspaceRepository },
      ],
    }).compile();

    service = module.get<WorkspacesService>(WorkspacesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('merges brandLogoUrl into settings without dropping existing keys', async () => {
    const fixture = {
      id: workspaceId,
      settings: { timezone: 'x', currency: 'y' },
    } as unknown as Workspace;
    workspaceRepository.findOne.mockResolvedValue(fixture);

    const result = await service.setBranding(workspaceId, 'https://cdn/logo.png');

    expect(result.brandLogoUrl).toBe('https://cdn/logo.png');
    expect((result as any).timezone).toBe('x');
    expect((result as any).currency).toBe('y');
    expect(workspaceRepository.save).toHaveBeenCalledTimes(1);
    // The saved entity must be the same merged object, not a stripped-down one.
    const saved = workspaceRepository.save.mock.calls[0][0];
    expect(saved.settings.brandLogoUrl).toBe('https://cdn/logo.png');
    expect(saved.settings.timezone).toBe('x');
    expect(saved.settings.currency).toBe('y');
  });

  it('clears brandLogoUrl when passed null, while preserving other keys', async () => {
    const fixture = {
      id: workspaceId,
      settings: { timezone: 'x', currency: 'y', brandLogoUrl: 'https://cdn/logo.png' },
    } as unknown as Workspace;
    workspaceRepository.findOne.mockResolvedValue(fixture);

    const result = await service.setBranding(workspaceId, null);

    expect(result.brandLogoUrl).toBeUndefined();
    expect((result as any).timezone).toBe('x');
    expect((result as any).currency).toBe('y');
  });

  it('throws NotFoundException when the workspace does not exist', async () => {
    workspaceRepository.findOne.mockResolvedValue(null);

    await expect(service.setBranding(workspaceId, 'https://cdn/logo.png')).rejects.toThrow(
      NotFoundException,
    );
    expect(workspaceRepository.save).not.toHaveBeenCalled();
  });
});
