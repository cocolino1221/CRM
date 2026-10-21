import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DealsService } from '../../deals/deals.service';
import { TasksService } from '../../tasks/tasks.service';
import { Deal } from '../../database/entities/deal.entity';
import { Task } from '../../database/entities/task.entity';

const WORKSPACE = 'workspace-123';

/** The row the services' own findOne() reloads through a query builder. */
let currentRow: any;

/** Deals and tasks carry tags on the same comma-joined `text` column contacts do. */
const repoMock = () => ({
  create: jest.fn().mockImplementation((data: any) => ({ ...data })),
  save: jest.fn().mockImplementation(async (entity: any) => ({ ...entity, id: 'row-1' })),
  findOne: jest.fn().mockResolvedValue({ id: 'row-1', workspaceId: WORKSPACE, tags: [] }),
  createQueryBuilder: jest.fn(() => chainableQb()),
});

/** Enough of a query builder for the bookkeeping these services do after a write. */
const chainableQb = (): any => {
  const qb: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'getMany') return jest.fn().mockResolvedValue([]);
        if (prop === 'getManyAndCount') return jest.fn().mockResolvedValue([[], 0]);
        if (prop === 'getOne') return jest.fn().mockResolvedValue(currentRow);
        if (prop === 'getRawMany') return jest.fn().mockResolvedValue([]);
        if (prop === 'getRawOne') return jest.fn().mockResolvedValue({});
        if (prop === 'getCount') return jest.fn().mockResolvedValue(0);
        if (prop === 'then') return undefined;
        return jest.fn(() => qb);
      },
    },
  );
  return qb;
};

describe('DealsService — tags on write', () => {
  let service: DealsService;
  let repo: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealsService,
        { provide: getRepositoryToken(Deal), useValue: repoMock() },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    currentRow = { id: 'row-1', workspaceId: WORKSPACE, stage: 'lead', tags: [] };
    service = module.get(DealsService);
    repo = module.get(getRepositoryToken(Deal));
  });

  it('splits a comma in a tag on create', async () => {
    await service.create(WORKSPACE, { title: 'Abonament', value: 100, tags: ['vip, urgent'] } as any);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['vip', 'urgent'] }),
    );
  });

  it('leaves tags alone when the caller did not send any', async () => {
    await service.create(WORKSPACE, { title: 'Abonament', value: 100 } as any);

    expect(repo.create.mock.calls[0][0].tags).toBeUndefined();
  });

  it('splits a comma in a tag on update', async () => {
    currentRow = { id: 'deal-1', workspaceId: WORKSPACE, stage: 'lead', tags: [] };

    await service.update(WORKSPACE, 'deal-1', { tags: ['VIP', 'vip, nou'] } as any);

    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ tags: ['VIP', 'nou'] }));
  });
});

describe('TasksService — tags on write', () => {
  let service: TasksService;
  let repo: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: getRepositoryToken(Task), useValue: repoMock() },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    currentRow = { id: 'row-1', workspaceId: WORKSPACE, status: 'pending', tags: [] };
    service = module.get(TasksService);
    repo = module.get(getRepositoryToken(Task));
  });

  it('splits a comma in a tag on create', async () => {
    await service.create(WORKSPACE, 'user-1', { title: 'Sună clientul', tags: ['urgent, azi'] } as any);

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['urgent', 'azi'] }),
    );
  });

  it('splits a comma in a tag on update', async () => {
    currentRow = { id: 'task-1', workspaceId: WORKSPACE, status: 'pending', tags: [] };

    await service.update(WORKSPACE, 'task-1', { tags: ['urgent, azi'] } as any);

    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ tags: ['urgent', 'azi'] }));
  });
});
