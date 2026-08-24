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
  let moduleRef: any;

  beforeEach(async () => {
    funnelRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'f1', ...x })),
      find: jest.fn(async () => []),
      findOne: jest.fn(),
      remove: jest.fn(async () => undefined),
    };
    moduleRef = await Test.createTestingModule({
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

  it('enroll() starts the flow instantly and arms the anchor-relative step from the flow\'s second step', async () => {
    funnelRepo.findOne.mockResolvedValueOnce({
      id: 'f1', workspaceId: 'ws1', status: FunnelStatus.ACTIVE, flowId: 'flow1',
      anchorDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    });
    const whatsapp = moduleRef.get(WhatsAppService);
    whatsapp.getFlows.mockResolvedValue([{
      id: 'flow1', enabled: true,
      steps: [
        { id: 'step1', message: 'Thanks for registering!' },
        { id: 'step2', message: 'Reminder!', anchorOffset: { relation: 'before', minutes: 24 * 60 } },
      ],
    }]);
    whatsapp.startFlowForWorkspace.mockResolvedValue(true);
    const enrollmentRepo = moduleRef.get(getRepositoryToken(FunnelEnrollment));
    enrollmentRepo.create = jest.fn((x: any) => x);
    enrollmentRepo.save = jest.fn(async (x: any) => ({ id: 'e1', ...x }));

    const contact = { id: 'c1', workspaceId: 'ws1', phone: '+40700000000' } as any;
    const enrollment = await service.enroll(contact, 'f1');

    expect(whatsapp.startFlowForWorkspace).toHaveBeenCalledWith('ws1', '+40700000000', 'flow1');
    expect(whatsapp.armFlowStepAt).toHaveBeenCalledWith(
      'ws1', '+40700000000', 'flow1', 'step1', 'step2', expect.any(Number),
    );
    const armedDelay = whatsapp.armFlowStepAt.mock.calls[0][5];
    expect(armedDelay).toBeGreaterThan(0);
    expect(armedDelay).toBeLessThanOrEqual(2 * 24 * 60 * 60 * 1000);
    expect(enrollment?.id).toBe('e1');
  });

  it('enroll() returns null and does not start a flow if the contact has no phone', async () => {
    funnelRepo.findOne.mockResolvedValueOnce({ id: 'f1', workspaceId: 'ws1', status: FunnelStatus.ACTIVE, flowId: 'flow1' });
    const whatsapp = moduleRef.get(WhatsAppService);
    const contact = { id: 'c1', workspaceId: 'ws1', phone: undefined } as any;
    const enrollment = await service.enroll(contact, 'f1');
    expect(enrollment).toBeNull();
    expect(whatsapp.startFlowForWorkspace).not.toHaveBeenCalled();
  });
});
