import { UnauthorizedException } from '@nestjs/common';
import { PayflowService } from './payflow.service';

describe('PayflowService', () => {
  const INTEGRATION_ID = '11111111-2222-4333-8444-555555555555';
  let integrations: any[];
  let integrationRepository: any;
  let contactRepository: any;
  let dealRepository: any;
  let pipelineRepository: any;
  let contactsService: any;
  let dealsService: any;
  let service: PayflowService;
  let existingDeal: any;

  beforeEach(() => {
    integrations = [];
    existingDeal = null;
    integrationRepository = {
      findOne: jest.fn(async ({ where }: any) =>
        integrations.find((i) => (where.id ? i.id === where.id : i.workspaceId === where.workspaceId)) || null),
      create: jest.fn((x) => ({ ...x })),
      save: jest.fn(async (x) => {
        if (!x.id) x.id = INTEGRATION_ID;
        if (!integrations.includes(x)) integrations.push(x);
        return x;
      }),
    };
    contactRepository = { findOne: jest.fn().mockResolvedValue(null) };
    dealRepository = {
      createQueryBuilder: jest.fn(() => ({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getOne: jest.fn(async () => existingDeal),
      })),
    };
    pipelineRepository = {
      findOne: jest.fn().mockResolvedValue({ id: 'p1', stages: [{ id: 's1' }] }),
      find: jest.fn().mockResolvedValue([]),
    };
    contactsService = { create: jest.fn(async (_ws, dto) => ({ id: 'c1', ...dto })), update: jest.fn() };
    dealsService = { create: jest.fn(async () => ({ id: 'd1' })) };
    service = new PayflowService(
      integrationRepository, contactRepository, dealRepository, pipelineRepository, contactsService, dealsService,
    );
  });

  it('issues a key that authenticates, and rotating it invalidates the old one', async () => {
    const first = await service.connect('ws1', 'u1');
    expect(first.key).toMatch(/^etcrm_/);
    await expect(service.authenticate(`Bearer ${first.key}`)).resolves.toMatchObject({ workspaceId: 'ws1' });

    const second = await service.connect('ws1', 'u1');
    await expect(service.authenticate(`Bearer ${second.key}`)).resolves.toBeTruthy();
    await expect(service.authenticate(`Bearer ${first.key}`)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects missing, malformed and wrong keys', async () => {
    const { key } = await service.connect('ws1', 'u1');
    await expect(service.authenticate(undefined)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.authenticate('Bearer pf_live_abc')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.authenticate(`Bearer ${key.slice(0, -1)}x`)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('creates the contact and a won deal for a new customer', async () => {
    const { key } = await service.connect('ws1', 'u1');
    const integration = await service.authenticate(`Bearer ${key}`);
    const result = await service.sync(integration, {
      customer: { id: 'cus_1', name: 'Ana Pop', email: 'ANA@example.com' },
      amount: 49.99, currency: 'eur', title: 'Course', transactionId: 'tx1',
      pipelineId: 'p1', pipelineStageId: 's1',
    } as any);

    expect(result).toMatchObject({ ok: true, contactId: 'c1', contactCreated: true, dealId: 'd1' });
    expect(contactsService.create).toHaveBeenCalledWith('ws1', expect.objectContaining({
      firstName: 'Ana', lastName: 'Pop', email: 'ana@example.com', source: 'payflow', pipelineStageId: 's1',
    }));
    expect(dealsService.create).toHaveBeenCalledWith('ws1', expect.objectContaining({
      value: 49.99, currency: 'EUR', stage: 'closed_won', contactId: 'c1',
    }));
  });

  it('does not duplicate a deal for a transaction already synced', async () => {
    const { key } = await service.connect('ws1', 'u1');
    const integration = await service.authenticate(`Bearer ${key}`);
    contactRepository.findOne.mockResolvedValue({ id: 'c9', pipelineStageId: null });
    existingDeal = { id: 'd-existing' };

    const result = await service.sync(integration, {
      customer: { email: 'ana@example.com' }, amount: 10, transactionId: 'tx1',
    } as any);
    expect(result).toMatchObject({ contactId: 'c9', contactCreated: false, dealId: 'd-existing' });
    expect(dealsService.create).not.toHaveBeenCalled();
  });
});
