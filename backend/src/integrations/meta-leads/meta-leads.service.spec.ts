import { IntegrationType } from '../../database/entities/integration.entity';
import { MetaLeadsService } from './meta-leads.service';

describe('MetaLeadsService', () => {
  let httpService: any;
  let contactRepository: any;
  let integrationRepository: any;
  let pipelineRepository: any;
  let contactsService: any;
  let whatsAppService: any;
  let notificationsService: any;
  let service: MetaLeadsService;

  const facebookIntegration = {
    id: 'integration-1',
    workspaceId: 'workspace-1',
    userId: 'owner-1',
    type: IntegrationType.API,
    externalId: 'facebook',
    name: 'Facebook',
    config: { provider: 'facebook', pageId: 'page-1', pageName: 'My Page' },
    credentials: { pageAccessToken: 'page-token' },
  };

  beforeEach(() => {
    httpService = { axiosRef: { get: jest.fn(), post: jest.fn() } };
    contactRepository = {
      createQueryBuilder: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(false),
      }),
    };
    integrationRepository = {
      find: jest.fn().mockResolvedValue([facebookIntegration]),
      save: jest.fn().mockImplementation((i) => Promise.resolve(i)),
    };
    pipelineRepository = { findOne: jest.fn().mockResolvedValue(null) };
    contactsService = { create: jest.fn().mockResolvedValue({ id: 'contact-1' }) };
    whatsAppService = { sendTemplateMessage: jest.fn(), sendTextMessage: jest.fn() };
    notificationsService = { create: jest.fn().mockResolvedValue(undefined) };

    service = new MetaLeadsService(
      httpService,
      contactRepository,
      integrationRepository,
      pipelineRepository,
      {} as any,
      contactsService,
      whatsAppService,
      notificationsService,
    );
  });

  describe('field mapping', () => {
    it('maps standard Meta lead field names to contact fields and puts the rest in customFields', () => {
      const result = (service as any).mapFieldDataToContact([
        { name: 'full_name', values: ['Jane Doe'] },
        { name: 'email', values: ['jane@example.com'] },
        { name: 'phone_number', values: ['+40712345678'] },
        { name: 'city', values: ['Bucharest'] },
      ]);

      expect(result.firstName).toBe('Jane');
      expect(result.lastName).toBe('Doe');
      expect(result.email).toBe('jane@example.com');
      expect(result.phone).toBe('+40712345678');
      expect(result.customFields).toEqual({ city: 'Bucharest' });
    });

    it('falls back to a generated name derived from the email when no name field is present', () => {
      const result = (service as any).mapFieldDataToContact([
        { name: 'email', values: ['john.smith@example.com'] },
      ]);
      (service as any).applyNameFallbacks(result);

      expect(result.firstName).toBe('John');
      expect(result.lastName).toBe('Smith');
    });

    it('defaults to "Lead" when there is no name and no email to derive one from', () => {
      const result = (service as any).mapFieldDataToContact([
        { name: 'phone_number', values: ['+40712345678'] },
      ]);
      (service as any).applyNameFallbacks(result);

      expect(result.firstName).toBe('Lead');
      expect(result.lastName).toBe('');
    });
  });

  describe('handleLeadgenChange', () => {
    const leadgenValue = { leadgen_id: 'lead-123', form_id: 'form-1', page_id: 'page-1' };

    it('fetches the lead via Graph API and creates a contact from field_data', async () => {
      httpService.axiosRef.get.mockResolvedValue({
        data: {
          form_id: 'form-1',
          field_data: [
            { name: 'full_name', values: ['Jane Doe'] },
            { name: 'email', values: ['jane@example.com'] },
            { name: 'phone_number', values: ['+40712345678'] },
          ],
        },
      });

      await (service as any).handleLeadgenChange(leadgenValue, { id: 'page-1' });

      expect(httpService.axiosRef.get).toHaveBeenCalledWith(
        expect.stringContaining('/lead-123'),
        expect.objectContaining({ params: expect.objectContaining({ access_token: 'page-token' }) }),
      );
      expect(contactsService.create).toHaveBeenCalledTimes(1);
      const [, dto] = contactsService.create.mock.calls[0];
      expect(dto.firstName).toBe('Jane');
      expect(dto.email).toBe('jane@example.com');
      expect(dto.customFields.metaLeadgenId).toBe('lead-123');
      expect(notificationsService.create).toHaveBeenCalledTimes(1);
    });

    it('does not create a duplicate contact when the same leadgen_id was already processed', async () => {
      contactRepository.createQueryBuilder.mockReturnValue({
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn().mockResolvedValue(true),
      });

      await (service as any).handleLeadgenChange(leadgenValue, { id: 'page-1' });

      expect(httpService.axiosRef.get).not.toHaveBeenCalled();
      expect(contactsService.create).not.toHaveBeenCalled();
    });

    it('drops a second delivery of the same leadgen_id within the same process (webhook retry)', async () => {
      httpService.axiosRef.get.mockResolvedValue({
        data: { form_id: 'form-1', field_data: [{ name: 'email', values: ['a@b.com'] }] },
      });

      await (service as any).handleLeadgenChange(leadgenValue, { id: 'page-1' });
      await (service as any).handleLeadgenChange(leadgenValue, { id: 'page-1' });

      expect(contactsService.create).toHaveBeenCalledTimes(1);
    });

    it('ignores a leadgen change for a page with no matching Facebook integration', async () => {
      integrationRepository.find.mockResolvedValue([]);

      await (service as any).handleLeadgenChange(leadgenValue, { id: 'page-1' });

      expect(httpService.axiosRef.get).not.toHaveBeenCalled();
      expect(contactsService.create).not.toHaveBeenCalled();
    });

    it('logs a clear warning instead of enrolling when the form has a funnelId configured (Phase 1 not implemented yet)', async () => {
      integrationRepository.find.mockResolvedValue([
        {
          ...facebookIntegration,
          config: {
            ...facebookIntegration.config,
            metaLeadForms: [{ formId: 'form-1', pageId: 'page-1', funnelId: 'funnel-abc' }],
          },
        },
      ]);
      httpService.axiosRef.get.mockResolvedValue({
        data: { form_id: 'form-1', field_data: [{ name: 'email', values: ['a@b.com'] }] },
      });
      const warnSpy = jest.spyOn((service as any).logger, 'warn');

      await (service as any).handleLeadgenChange(leadgenValue, { id: 'page-1' });

      expect(contactsService.create).toHaveBeenCalledTimes(1);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('funnelId=funnel-abc'));
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('NOT enrolled in any funnel'));
    });
  });

  describe('form config management', () => {
    it('adds, updates, and removes a form from integration.config.metaLeadForms', async () => {
      const integration: any = { config: {} };

      const { form, forms } = await service.addForm(integration, 'form-1', 'page-1', { name: 'Contact Form' });
      expect(form.formId).toBe('form-1');
      expect(forms).toHaveLength(1);
      integration.config.metaLeadForms = forms;

      await expect(service.addForm(integration, 'form-1', 'page-1')).rejects.toThrow();

      const updated = service.updateFormConfig(integration, 'form-1', { pipelineId: 'pipeline-1' });
      expect(updated[0].pipelineId).toBe('pipeline-1');

      const remaining = service.removeForm(integration, 'form-1');
      expect(remaining).toHaveLength(0);
      expect(() => service.removeForm(integration, 'form-1')).toThrow();
    });

    it('stores an optional funnelId on the form so it round-trips through add/update', async () => {
      const integration: any = { config: {} };

      const { form } = await service.addForm(integration, 'form-1', 'page-1', {
        name: 'Webinar signup',
        funnelId: 'funnel-abc',
      });
      expect(form.funnelId).toBe('funnel-abc');
      integration.config.metaLeadForms = [form];

      const updated = service.updateFormConfig(integration, 'form-1', { funnelId: 'funnel-xyz' });
      expect(updated[0].funnelId).toBe('funnel-xyz');
    });
  });
});
