import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { FunnelsService } from './funnels.service';
import { Funnel, FunnelStatus } from '../database/entities/funnel.entity';
import { FunnelEnrollment } from '../database/entities/funnel-enrollment.entity';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';

describe('FunnelsService CRUD', () => {
  let service: FunnelsService;
  let funnelRepo: any;

  beforeEach(async () => {
    funnelRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'f1', ...x })),
      find: jest.fn(async () => []),
      findOne: jest.fn(),
      remove: jest.fn(async () => undefined),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        FunnelsService,
        { provide: getRepositoryToken(Funnel), useValue: funnelRepo },
        { provide: getRepositoryToken(FunnelEnrollment), useValue: { create: jest.fn(), save: jest.fn(), find: jest.fn() } },
        { provide: WhatsAppService, useValue: { getFlows: jest.fn(), startFlowForWorkspace: jest.fn(), armFlowStepAt: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(FunnelsService);
  });

  it('creates a funnel scoped to the workspace', async () => {
    const created = await service.create('ws1', { name: 'Webinar Aug', integrationId: 'int1', flowId: 'flow1' } as any);
    expect(funnelRepo.create).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws1', name: 'Webinar Aug' }));
    expect(created.id).toBe('f1');
  });

  it('throws NotFoundException finding a funnel in another workspace', async () => {
    funnelRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.findOne('ws1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
