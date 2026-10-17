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

describe('WhatsAppService WooCommerce product filtering', () => {
  let service: any;

  const productRule = {
    id: 'r1', name: 'Course buyers', enabled: true, priority: 0,
    templateName: 'course_welcome', language: 'en',
    conditions: { wooProducts: ['101'] },
  };
  const catchAllRule = {
    id: 'r2', name: 'Everyone', enabled: true, priority: 1,
    templateName: 'hello', language: 'en', conditions: {},
  };

  const wooContact = (productId: string) => ({
    id: 'c1', firstName: 'Ana', lastName: 'Pop', phone: '+40700000000', source: 'woocommerce',
    customFields: { wooOrder: { lineItems: [{ productId, name: `Product ${productId}` }] } },
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
  });

  it('a catch-all rule does not fire for WooCommerce orders', () => {
    const config = { autoSendRules: [catchAllRule] };
    expect(service.selectAutoSendRule(wooContact('999'), config)).toBeNull();
  });

  it('a product rule fires only for its product', () => {
    const config = { autoSendRules: [productRule, catchAllRule] };
    expect(service.selectAutoSendRule(wooContact('101'), config)?.id).toBe('r1');
    expect(service.selectAutoSendRule(wooContact('999'), config)).toBeNull();
  });

  it('a rule explicitly targeting the woocommerce source still fires for any product', () => {
    const config = { autoSendRules: [{ ...catchAllRule, conditions: { sources: ['woocommerce'] } }] };
    expect(service.selectAutoSendRule(wooContact('999'), config)?.id).toBe('r2');
  });

  it('catch-all rules keep working for non-WooCommerce contacts', () => {
    const config = { autoSendRules: [catchAllRule] };
    expect(service.selectAutoSendRule({ ...wooContact('1'), source: 'typeform' }, config)?.id).toBe('r2');
  });

  describe('lead notification', () => {
    let notify: jest.SpyInstance;
    const run = async (contact: any, rules: any[]) => {
      jest.spyOn(service, 'listWorkspaceWhatsAppIntegrations').mockResolvedValue([{ id: 'i1', config: { autoSendRules: rules } }]);
      jest.spyOn(service, 'chooseAutoSendConfigIntegration').mockImplementation((list: any) => list[0]);
      // Stop right after the notification decision — sending is covered elsewhere.
      jest.spyOn(service, 'selectAutoSendRule').mockReturnValue(null);
      await service.handleContactCreatedEvent({ contact, workspaceId: 'ws1' });
    };

    beforeEach(() => {
      notify = jest.spyOn(service, 'notifyWorkspace').mockResolvedValue(undefined);
    });

    it('is skipped for an order without a watched product', async () => {
      await run(wooContact('999'), [productRule]);
      expect(notify).not.toHaveBeenCalled();
    });

    it('is sent for an order containing a watched product', async () => {
      await run(wooContact('101'), [productRule]);
      expect(notify).toHaveBeenCalledTimes(1);
    });

    it('is sent for every order when no rule selects products', async () => {
      await run(wooContact('999'), [catchAllRule]);
      expect(notify).toHaveBeenCalledTimes(1);
    });

    it('ignores product lists on disabled rules', async () => {
      await run(wooContact('999'), [{ ...productRule, enabled: false }]);
      expect(notify).toHaveBeenCalledTimes(1);
    });

    it('is unaffected for non-WooCommerce leads', async () => {
      await run({ ...wooContact('999'), source: 'typeform' }, [productRule]);
      expect(notify).toHaveBeenCalledTimes(1);
    });
  });
});
