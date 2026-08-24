import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WhatsAppService } from './whatsapp.service';
import { Contact } from '../../database/entities/contact.entity';
import { Activity } from '../../database/entities/activity.entity';
import { Integration } from '../../database/entities/integration.entity';
import { User } from '../../database/entities/user.entity';
import { PipelineStage } from '../../database/entities/pipeline-stage.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { WhatsAppAIService } from './whatsapp-ai.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UploadService } from '../../upload/upload.service';
import { WhatsAppFollowupDispatchService } from './whatsapp-followup-dispatch.service';
import { WhatsAppCallingService } from './whatsapp-calling.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../../email/email.service';

describe('WhatsAppService flow arming', () => {
  let service: WhatsAppService;
  let integrationRepository: any;
  let followupDispatch: any;

  const baseIntegration = {
    id: 'int1',
    workspaceId: 'ws1',
    credentials: {},
    config: {
      conversationFlows: [
        {
          id: 'flow1',
          enabled: true,
          trigger: 'landing_page_submit',
          steps: [
            { id: 'step1', message: 'Thanks for registering!' },
            { id: 'step2', message: 'See you tomorrow!' },
          ],
        },
      ],
      flowStates: {},
    },
  };

  beforeEach(async () => {
    integrationRepository = {
      find: jest.fn().mockResolvedValue([baseIntegration]),
      save: jest.fn(async (x) => x),
    };
    followupDispatch = { schedule: jest.fn(), cancel: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        { provide: getRepositoryToken(Contact), useValue: { findOne: jest.fn(), createQueryBuilder: jest.fn() } },
        { provide: getRepositoryToken(Activity), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(Integration), useValue: integrationRepository },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(PipelineStage), useValue: { findOne: jest.fn() } },
        { provide: NotificationsService, useValue: {} },
        { provide: WhatsAppAIService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: UploadService, useValue: {} },
        { provide: WhatsAppFollowupDispatchService, useValue: followupDispatch },
        { provide: WhatsAppCallingService, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: EmailService, useValue: { sendMail: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(WhatsAppService);
    jest.spyOn<any, any>(service, 'sendMessageWithCredentials').mockResolvedValue({ messages: [{ id: 'wamid1' }] });
    jest.spyOn<any, any>(service, 'sendTextMessage').mockResolvedValue(undefined);
    jest.spyOn<any, any>(service, 'saveOutboundActivity').mockResolvedValue(undefined);
  });

  it('startFlowForWorkspace arms the named flow directly, no auto-send rule needed', async () => {
    const started = await service.startFlowForWorkspace('ws1', '40700000000', 'flow1');
    expect(started).toBe(true);
    expect(integrationRepository.save).toHaveBeenCalled();
    const saved = integrationRepository.save.mock.calls[0][0];
    expect(saved.config.flowStates['40700000000'].currentStepId).toBe('step1');
  });

  it('armFlowStepAt schedules a durable job with an explicit target step', async () => {
    await service.armFlowStepAt('ws1', '40700000000', 'flow1', 'step1', 'step2', 60000);
    expect(followupDispatch.schedule).toHaveBeenCalledWith('flow1', '40700000000', 'ws1', 'step1', 60000, 'step2');
  });

  it('handleFollowupTimeout sends the explicit targetStepId, not the step\'s own timeoutBranch', async () => {
    integrationRepository.find.mockResolvedValueOnce([{
      ...baseIntegration,
      config: {
        ...baseIntegration.config,
        flowStates: { '40700000000': { flowId: 'flow1', currentStepId: 'step1' } },
      },
    }]);
    await service.handleFollowupTimeout('ws1', '40700000000', 'flow1', 'step1', 'step2');
    expect((service as any).sendTextMessage).toHaveBeenCalledWith('40700000000', 'See you tomorrow!', {});
  });

  it('handleFollowupTimeout no-ops if the contact already moved past the armed step', async () => {
    integrationRepository.find.mockResolvedValueOnce([{
      ...baseIntegration,
      config: {
        ...baseIntegration.config,
        flowStates: { '40700000000': { flowId: 'flow1', currentStepId: 'step2' } },
      },
    }]);
    await service.handleFollowupTimeout('ws1', '40700000000', 'flow1', 'step1', 'step2');
    expect((service as any).sendTextMessage).not.toHaveBeenCalled();
  });
});
