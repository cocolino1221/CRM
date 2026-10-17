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

/**
 * Which sources are worth interrupting the team for.
 *
 * One purchase used to arrive as three pushes: Payflow created the contact
 * (notified twice, once per emitter) and the WooCommerce webhook for the same
 * order notified again. Payflow is a payment for someone already being worked,
 * so it says nothing new and is silent here.
 */
describe('WhatsAppService — which sources notify the workspace', () => {
  let service: any;
  let notify: jest.SpyInstance;

  const contact = (source: string) => ({
    id: 'c1',
    firstName: 'Vlad',
    lastName: '-',
    phone: '+40700000000',
    source,
  });

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        { provide: getRepositoryToken(Contact), useValue: {} },
        { provide: getRepositoryToken(Activity), useValue: {} },
        { provide: getRepositoryToken(Integration), useValue: {} },
        { provide: getRepositoryToken(User), useValue: {} },
        { provide: getRepositoryToken(PipelineStage), useValue: {} },
        { provide: NotificationsService, useValue: {} },
        { provide: WhatsAppAIService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: UploadService, useValue: {} },
        { provide: WhatsAppFollowupDispatchService, useValue: {} },
        { provide: WhatsAppCallingService, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: EmailService, useValue: {} },
      ],
    }).compile();
    service = moduleRef.get(WhatsAppService);

    jest
      .spyOn(service, 'listWorkspaceWhatsAppIntegrations')
      .mockResolvedValue([{ id: 'i1', config: { autoSendRules: [] } }]);
    jest.spyOn(service, 'chooseAutoSendConfigIntegration').mockImplementation((list: any) => list[0]);
    // Stop right after the notification decision — sending is covered elsewhere.
    jest.spyOn(service, 'selectAutoSendRule').mockReturnValue(null);
    notify = jest.spyOn(service, 'notifyWorkspace').mockResolvedValue(undefined);
  });

  afterEach(() => jest.clearAllMocks());

  it('stays silent for a Payflow payment', async () => {
    await service.handleContactCreatedEvent({ contact: contact('payflow'), workspaceId: 'ws1' });

    expect(notify).not.toHaveBeenCalled();
  });

  it('stays silent for a returning Payflow payer', async () => {
    await service.handleContactCreatedEvent({
      contact: contact('payflow'),
      workspaceId: 'ws1',
      returning: true,
    });

    expect(notify).not.toHaveBeenCalled();
  });

  it('still notifies for a Typeform lead', async () => {
    await service.handleContactCreatedEvent({ contact: contact('typeform'), workspaceId: 'ws1' });

    expect(notify).toHaveBeenCalledTimes(1);
  });
});
