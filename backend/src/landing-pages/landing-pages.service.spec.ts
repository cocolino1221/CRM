import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LandingPagesService } from './landing-pages.service';
import {
  LandingPage,
  LandingPageStatus,
  LandingPageCaptureType,
} from '../database/entities/landing-page.entity';
import { FormsService } from '../forms/forms.service';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';
import { FunnelsService } from '../funnels/funnels.service';
import { ContactSource } from '../database/entities/contact.entity';

describe('LandingPagesService', () => {
  let service: LandingPagesService;
  let repo: any;
  let formsService: any;
  let whatsappService: any;
  let funnelsService: any;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'lp1', ...x })),
      update: jest.fn(async () => undefined),
      remove: jest.fn(async () => undefined),
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: () => ({}),
        where: () => ({ andWhere: () => ({}), orderBy: () => ({ getMany: async () => [] }) }),
        orderBy: () => ({ getMany: async () => [] }),
      })),
    };
    formsService = {
      findFormById: jest.fn(),
      createSubmissionForForm: jest.fn(),
    };
    whatsappService = { sendMessageForWorkspace: jest.fn() };
    funnelsService = { enroll: jest.fn().mockResolvedValue(null) };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LandingPagesService,
        { provide: getRepositoryToken(LandingPage), useValue: repo },
        { provide: FormsService, useValue: formsService },
        { provide: WhatsAppService, useValue: whatsappService },
        { provide: FunnelsService, useValue: funnelsService },
      ],
    }).compile();

    service = moduleRef.get(LandingPagesService);
  });

  it('rejects a duplicate slug on create', async () => {
    repo.findOne.mockResolvedValueOnce({ id: 'existing' });
    await expect(
      service.create('u1', 'w1', { name: 'Promo', slug: 'promo' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stamps publishedAt when created active', async () => {
    repo.findOne.mockResolvedValueOnce(null);
    const saved = await service.create('u1', 'w1', {
      name: 'Promo',
      status: LandingPageStatus.ACTIVE,
    } as any);
    expect(saved.publishedAt).toBeInstanceOf(Date);
  });

  it('does not stamp publishedAt when created as draft', async () => {
    repo.findOne.mockResolvedValueOnce(null);
    const saved = await service.create('u1', 'w1', { name: 'Promo' } as any);
    expect(saved.publishedAt).toBeUndefined();
  });

  it('stamps publishedAt on first active transition and preserves it after', async () => {
    const page: any = {
      id: 'lp1',
      workspaceId: 'w1',
      slug: 'promo',
      status: LandingPageStatus.DRAFT,
      publishedAt: undefined,
    };
    repo.findOne.mockResolvedValue(page);
    await service.update('lp1', 'w1', { status: LandingPageStatus.ACTIVE } as any);
    const firstCall = repo.save.mock.calls[0][0];
    expect(firstCall.publishedAt).toBeInstanceOf(Date);
  });

  it('returns 404 for a non-active page on public fetch', async () => {
    repo.findOne.mockResolvedValueOnce(null);
    await expect(
      service.findPublicBySlug('promo', { countUnique: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bumps viewCount always and uniqueViewCount only when countUnique', async () => {
    const page: any = {
      id: 'lp1',
      slug: 'promo',
      status: LandingPageStatus.ACTIVE,
      viewCount: 5,
      uniqueViewCount: 2,
    };
    repo.findOne.mockResolvedValue(page);
    await service.findPublicBySlug('promo', { countUnique: false });
    expect(repo.update).toHaveBeenCalledWith('lp1', { viewCount: 6 });
    await service.findPublicBySlug('promo', { countUnique: true });
    expect(repo.update).toHaveBeenCalledWith('lp1', { viewCount: 6, uniqueViewCount: 3 });
  });

  it('native submit creates lead with LANDING_PAGE source and attempts whatsapp', async () => {
    const page: any = {
      id: 'lp1',
      workspaceId: 'w1',
      slug: 'promo',
      status: LandingPageStatus.ACTIVE,
      captureType: LandingPageCaptureType.NATIVE,
      formId: 'f1',
      submissionCount: 0,
      postSubmit: { successMessage: 'Thanks!', whatsapp: { enabled: true, message: 'Hi {{name}}' } },
    };
    repo.findOne.mockResolvedValue(page);
    const form = { id: 'f1', workspaceId: 'w1', fields: [{ id: 'p', type: 'phone' }] };
    formsService.findFormById.mockResolvedValue(form);
    formsService.createSubmissionForForm.mockResolvedValue({
      submission: { id: 's1', data: { p: '+15551234567' } },
      contact: { id: 'c1', firstName: 'Ana' },
    });

    const res = await service.submitPublic('promo', { data: { p: '+15551234567' } } as any, {});

    expect(formsService.createSubmissionForForm).toHaveBeenCalledWith(
      form,
      { p: '+15551234567' },
      expect.objectContaining({ trackingData: expect.objectContaining({ landingPageId: 'lp1' }) }),
      ContactSource.LANDING_PAGE,
    );
    expect(whatsappService.sendMessageForWorkspace).toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.successMessage).toBe('Thanks!');
  });

  it('native submit does not fail when whatsapp throws', async () => {
    const page: any = {
      id: 'lp1', workspaceId: 'w1', slug: 'promo', status: LandingPageStatus.ACTIVE,
      captureType: LandingPageCaptureType.NATIVE, formId: 'f1', submissionCount: 0,
      postSubmit: { whatsapp: { enabled: true, message: 'Hi' } },
    };
    repo.findOne.mockResolvedValue(page);
    formsService.findFormById.mockResolvedValue({ id: 'f1', workspaceId: 'w1', fields: [{ id: 'p', type: 'phone' }] });
    formsService.createSubmissionForForm.mockResolvedValue({
      submission: { id: 's1', data: { p: '+15551234567' } }, contact: { id: 'c1' },
    });
    whatsappService.sendMessageForWorkspace.mockRejectedValue(new Error('wa down'));

    const res = await service.submitPublic('promo', { data: { p: '+15551234567' } } as any, {});
    expect(res.success).toBe(true);
  });

  it('submitPublic enrolls the new contact into the linked funnel when the page has one', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: 'lp1', workspaceId: 'ws1', formId: 'form1', funnelId: 'funnel1',
      captureType: LandingPageCaptureType.NATIVE, submissionCount: 0,
    });
    formsService.findFormById.mockResolvedValueOnce({ id: 'form1', fields: [] });
    const contact = { id: 'c1', workspaceId: 'ws1', phone: '+40700000000' };
    formsService.createSubmissionForForm.mockResolvedValueOnce({ submission: { data: {} }, contact });

    await service.submitPublic('promo', { data: {} } as any, {});

    expect(funnelsService.enroll).toHaveBeenCalledWith(contact, 'funnel1');
  });

  it('submitPublic does not call enroll when the page has no funnelId', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: 'lp1', workspaceId: 'ws1', formId: 'form1', funnelId: undefined,
      captureType: LandingPageCaptureType.NATIVE, submissionCount: 0,
    });
    formsService.findFormById.mockResolvedValueOnce({ id: 'form1', fields: [] });
    formsService.createSubmissionForForm.mockResolvedValueOnce({ submission: { data: {} }, contact: { id: 'c1' } });

    await service.submitPublic('promo', { data: {} } as any, {});

    expect(funnelsService.enroll).not.toHaveBeenCalled();
  });

  it('rejects native submit on a typeform page', async () => {
    repo.findOne.mockResolvedValue({
      id: 'lp1', slug: 'promo', status: LandingPageStatus.ACTIVE,
      captureType: LandingPageCaptureType.TYPEFORM,
    });
    await expect(
      service.submitPublic('promo', { data: {} } as any, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('duplicate resets status, counters, publishedAt and gets a new slug', async () => {
    const orig: any = {
      id: 'lp1', name: 'Promo', slug: 'promo', workspaceId: 'w1',
      status: LandingPageStatus.ACTIVE, content: { benefits: ['x'] },
      captureType: LandingPageCaptureType.NATIVE, formId: 'f1',
      viewCount: 10, uniqueViewCount: 8, submissionCount: 4,
      publishedAt: new Date(), experimentId: 'e1', variantGroup: 'A',
    };
    repo.findOne.mockResolvedValueOnce(orig).mockResolvedValue(null);
    const copy = await service.duplicate('lp1', 'w1', 'u2');
    expect(copy.status).toBe(LandingPageStatus.DRAFT);
    expect(copy.viewCount).toBe(0);
    expect(copy.uniqueViewCount).toBe(0);
    expect(copy.submissionCount).toBe(0);
    expect(copy.publishedAt).toBeNull();
    expect(copy.slug).not.toBe('promo');
    expect(copy.slug).toContain('promo-copy');
  });

  it('getPublicView attaches the form for native pages', async () => {
    const page: any = {
      id: 'lp1', slug: 'promo', status: LandingPageStatus.ACTIVE,
      captureType: LandingPageCaptureType.NATIVE, formId: 'f1', workspaceId: 'w1',
      viewCount: 0, uniqueViewCount: 0,
    };
    repo.findOne.mockResolvedValue(page);
    formsService.findFormById.mockResolvedValue({
      id: 'f1', name: 'Lead form', fields: [{ id: 'e', type: 'email', label: 'Email' }], settings: {},
    });
    const res = await service.getPublicView('promo', { countUnique: true });
    expect(res.page.id).toBe('lp1');
    expect(res.form?.id).toBe('f1');
    expect(res.form?.fields).toHaveLength(1);
  });

  it('getPublicView returns null form when the referenced form is gone', async () => {
    const page: any = {
      id: 'lp1', slug: 'promo', status: LandingPageStatus.ACTIVE,
      captureType: LandingPageCaptureType.NATIVE, formId: 'gone', workspaceId: 'w1',
      viewCount: 0, uniqueViewCount: 0,
    };
    repo.findOne.mockResolvedValue(page);
    formsService.findFormById.mockResolvedValue(null);
    const res = await service.getPublicView('promo', { countUnique: false });
    expect(res.form).toBeNull();
  });

  it('skipView avoids bumping counters', async () => {
    const page: any = {
      id: 'lp1', slug: 'promo', status: LandingPageStatus.ACTIVE,
      captureType: LandingPageCaptureType.TYPEFORM, viewCount: 3, uniqueViewCount: 1,
    };
    repo.findOne.mockResolvedValue(page);
    await service.findPublicBySlug('promo', { countUnique: true, skipView: true });
    expect(repo.update).not.toHaveBeenCalled();
  });
});
