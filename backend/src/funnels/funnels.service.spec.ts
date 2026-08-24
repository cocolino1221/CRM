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
  let enrollmentRepoMock: any;
  let moduleRef: any;

  beforeEach(async () => {
    funnelRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'f1', ...x })),
      find: jest.fn(async () => []),
      findOne: jest.fn(),
      remove: jest.fn(async () => undefined),
    };
    enrollmentRepoMock = {
      create: jest.fn(),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
    };
    moduleRef = await Test.createTestingModule({
      providers: [
        FunnelsService,
        { provide: getRepositoryToken(Funnel), useValue: funnelRepo },
        { provide: getRepositoryToken(FunnelEnrollment), useValue: enrollmentRepoMock },
        { provide: WhatsAppService, useValue: { getFlows: jest.fn(), startFlowForWorkspace: jest.fn(), armFlowStepAt: jest.fn(), getFlowState: jest.fn() } },
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

  it('setAttended(true) records the flag and immediately routes to the step\'s attendedNextStepId', async () => {
    enrollmentRepoMock.findOne = jest.fn().mockResolvedValue({
      id: 'e1', workspaceId: 'ws1', funnelId: 'f1', waId: '+40700000000', currentStepId: 'step2',
    });
    enrollmentRepoMock.save = jest.fn(async (x: any) => x);
    funnelRepo.findOne.mockResolvedValueOnce({ id: 'f1', workspaceId: 'ws1', flowId: 'flow1' });
    const whatsapp = moduleRef.get(WhatsAppService);
    // Engine's live state agrees with the enrollment record here (contact still at step2).
    whatsapp.getFlowState.mockResolvedValue({ flowId: 'flow1', currentStepId: 'step2' });
    whatsapp.getFlows.mockResolvedValue([{
      id: 'flow1', enabled: true,
      steps: [
        { id: 'step1' },
        { id: 'step2', attendedNextStepId: 'step3-thanks', timeoutBranch: { delayValue: 4, delayUnit: 'hours', nextStepId: 'step3-noshow' } },
        { id: 'step3-thanks', message: 'Thanks for coming!' },
      ],
    }]);

    const updated = await service.setAttended('ws1', 'e1', true);

    expect(updated.attendedManual).toBe(true);
    expect(whatsapp.armFlowStepAt).toHaveBeenCalledWith('ws1', '+40700000000', 'flow1', 'step2', 'step3-thanks', 0);
  });

  it('setAttended(true) targets the engine\'s LIVE current step, not the stale enrollment.currentStepId', async () => {
    // Real-world seam: the anchor job already advanced the engine to step2, but the
    // DB's enrollment.currentStepId was written once at enroll() and is still 'step1'.
    // setAttended must branch off the live engine step (step2), not the stale DB value.
    enrollmentRepoMock.findOne = jest.fn().mockResolvedValue({
      id: 'e1', workspaceId: 'ws1', funnelId: 'f1', waId: '+40700000000', currentStepId: 'step1',
    });
    enrollmentRepoMock.save = jest.fn(async (x: any) => x);
    funnelRepo.findOne.mockResolvedValueOnce({ id: 'f1', workspaceId: 'ws1', flowId: 'flow1' });
    const whatsapp = moduleRef.get(WhatsAppService);
    whatsapp.getFlowState.mockResolvedValue({ flowId: 'flow1', currentStepId: 'step2' });
    whatsapp.getFlows.mockResolvedValue([{
      id: 'flow1', enabled: true,
      steps: [
        { id: 'step1', message: 'Thanks for registering!' }, // no attendedNextStepId — the stale step
        { id: 'step2', attendedNextStepId: 'step3-thanks', timeoutBranch: { delayValue: 4, delayUnit: 'hours', nextStepId: 'step3-noshow' } },
        { id: 'step3-thanks', message: 'Thanks for coming!' },
      ],
    }]);

    await service.setAttended('ws1', 'e1', true);

    // Arms off the engine's step2 → step3-thanks, NOT the stale enrollment step1.
    expect(whatsapp.armFlowStepAt).toHaveBeenCalledWith('ws1', '+40700000000', 'flow1', 'step2', 'step3-thanks', 0);
    expect(whatsapp.armFlowStepAt).not.toHaveBeenCalledWith(
      'ws1', '+40700000000', 'flow1', 'step1', expect.anything(), expect.anything(),
    );
  });

  it('setAttended(true) skips the branch dispatch when the contact is not in any live flow', async () => {
    enrollmentRepoMock.findOne = jest.fn().mockResolvedValue({
      id: 'e1', workspaceId: 'ws1', funnelId: 'f1', waId: '+40700000000', currentStepId: 'step2',
    });
    enrollmentRepoMock.save = jest.fn(async (x: any) => x);
    const whatsapp = moduleRef.get(WhatsAppService);
    whatsapp.getFlowState.mockResolvedValue(null); // flow already ended / never started

    const updated = await service.setAttended('ws1', 'e1', true);

    expect(updated.attendedManual).toBe(true);
    expect(whatsapp.armFlowStepAt).not.toHaveBeenCalled();
  });

  it('setAttended(false) just records the flag, leaving the existing no-show timeoutBranch to fire on its own', async () => {
    enrollmentRepoMock.findOne = jest.fn().mockResolvedValue({
      id: 'e1', workspaceId: 'ws1', funnelId: 'f1', waId: '+40700000000', currentStepId: 'step2',
    });
    enrollmentRepoMock.save = jest.fn(async (x: any) => x);
    const whatsapp = moduleRef.get(WhatsAppService);
    whatsapp.getFlowState.mockResolvedValue({ flowId: 'flow1', currentStepId: 'step2' });
    whatsapp.getFlows.mockResolvedValue([{ id: 'flow1', enabled: true, steps: [{ id: 'step2', attendedNextStepId: 'step3-thanks' }] }]);

    const updated = await service.setAttended('ws1', 'e1', false);

    expect(updated.attendedManual).toBe(false);
    expect(whatsapp.armFlowStepAt).not.toHaveBeenCalled();
  });

  it('listEnrollments scopes to workspace and funnel', async () => {
    const enrollmentRepo = moduleRef.get(getRepositoryToken(FunnelEnrollment));
    enrollmentRepo.find = jest.fn().mockResolvedValue([{ id: 'e1' }]);
    const result = await service.listEnrollments('ws1', 'f1');
    expect(enrollmentRepo.find).toHaveBeenCalledWith({ where: { workspaceId: 'ws1', funnelId: 'f1' }, order: { enrolledAt: 'DESC' } });
    expect(result).toEqual([{ id: 'e1' }]);
  });
});
