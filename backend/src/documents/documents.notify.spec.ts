import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpService } from '@nestjs/axios';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DocumentsService } from './documents.service';
import { Document } from '../database/entities/document.entity';
import { User } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';
import { Deal } from '../database/entities/deal.entity';
import { Integration } from '../database/entities/integration.entity';
import { PandaDocIntegrationHandler } from '../integrations/handlers/pandadoc.handler';
import { DocuSignIntegrationHandler } from '../integrations/handlers/docusign.handler';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';

// Minimal mock repository — only the methods exercised by the notify helpers under test.
const createMockRepository = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('DocumentsService — payment/contract notification categories', () => {
  let service: DocumentsService;
  let notificationsService: jest.Mocked<Pick<NotificationsService, 'create'>>;
  let userRepositoryMock: ReturnType<typeof createMockRepository>;

  const workspaceId = 'workspace-1';
  const document = {
    id: 'doc-1',
    workspaceId,
    createdById: 'sender-1',
    dealId: 'deal-1',
    contactId: 'contact-1',
    name: 'Contract cu Acme SRL',
  } as Document;

  const payload = { title: 'Plata confirmata', message: 'Test message', link: '/payments' };

  beforeEach(async () => {
    notificationsService = {
      create: jest.fn().mockResolvedValue({}),
    } as any;

    userRepositoryMock = createMockRepository();
    // Seam for notifyDocumentStakeholders() → getStakeholderUserIds(): single findOne lookup.
    userRepositoryMock.findOne.mockResolvedValue({ id: 'sender-1' } as any);
    // Seam for notifyPaymentCompletedAudience() → getPaymentCompletionAudienceUserIds(): query builder.
    const queryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([{ id: 'leader-1' }]),
    };
    userRepositoryMock.createQueryBuilder.mockReturnValue(queryBuilder as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: getRepositoryToken(Document), useValue: createMockRepository() },
        { provide: getRepositoryToken(User), useValue: userRepositoryMock },
        { provide: getRepositoryToken(Contact), useValue: createMockRepository() },
        { provide: getRepositoryToken(Deal), useValue: createMockRepository() },
        { provide: getRepositoryToken(Integration), useValue: createMockRepository() },
        { provide: PandaDocIntegrationHandler, useValue: {} },
        { provide: DocuSignIntegrationHandler, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: NotificationsService, useValue: notificationsService },
        { provide: EmailService, useValue: {} },
        { provide: WhatsAppService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // notifyPaymentCompletedAudience() is where 'paid' | 'failed' is actually mapped to
  // 'payment:received' | 'payment:failed'. Invoke the private method directly (the
  // narrowest real seam) with a mocked NotificationsService and assert on the category
  // it hands to create().
  it('maps a paid payment status to the "payment:received" category', async () => {
    await (service as any).notifyPaymentCompletedAudience(document, payload, 'paid');

    expect(notificationsService.create).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({ category: 'payment:received' }),
    );
  });

  it('maps a failed payment status to the "payment:failed" category', async () => {
    await (service as any).notifyPaymentCompletedAudience(document, payload, 'failed');

    expect(notificationsService.create).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({ category: 'payment:failed' }),
    );
  });

  // Guards the paymentStatus default itself (still 'paid' on the helper's signature) so
  // that if some future call site still omits the argument, it degrades to the correct
  // category rather than an arbitrary one.
  it('still resolves to "payment:received" when paymentStatus is omitted', async () => {
    await (service as any).notifyPaymentCompletedAudience(document, payload);

    expect(notificationsService.create).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({ category: 'payment:received' }),
    );
  });

  // The reconciliation "paid" trigger (documents.service.ts ~line 1048) now passes the
  // status explicitly instead of relying on the default above. Pin the literal at the
  // source so a refactor that drops it or flips it silently fails this test.
  it('keeps the reconciliation-paid webhook call site pinned to an explicit "paid" literal', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, 'documents.service.ts'), 'utf8');

    const anchor = "message: `${payment.customerName || 'Clientul'} a platit pentru \"${document.name}\".`,";
    const anchorIndex = source.indexOf(anchor);
    expect(anchorIndex).toBeGreaterThan(-1);

    const callSiteWindow = source.slice(anchorIndex, anchorIndex + 200);
    expect(callSiteWindow).toContain("'paid'");
  });

  // 'payment:contract' is a literal supplied by the esemneaza "signed" webhook handler to
  // the generic notifyDocumentStakeholders() helper (there is no dedicated computation
  // helper for it). Verify the helper itself passes an explicit category straight through
  // to NotificationsService.create() unmodified.
  it('propagates an explicit "payment:contract" category through notifyDocumentStakeholders', async () => {
    await (service as any).notifyDocumentStakeholders(
      document,
      { title: 'Contract semnat', message: 'Documentul a fost semnat.' },
      'payment:contract',
    );

    expect(notificationsService.create).toHaveBeenCalledWith(
      workspaceId,
      expect.objectContaining({ category: 'payment:contract' }),
    );
  });

  // Pins the literal at the esemneaza "signed" webhook call site so a refactor can't
  // silently swap it for a different category string.
  it('keeps the esemneaza signed webhook call site pinned to the "payment:contract" literal', () => {
    const fs = require('fs');
    const path = require('path');
    const source = fs.readFileSync(path.join(__dirname, 'documents.service.ts'), 'utf8');

    const anchor = "document.addAuditEntry('esemneaza.signed', 'webhook', { event });";
    const anchorIndex = source.indexOf(anchor);
    expect(anchorIndex).toBeGreaterThan(-1);

    const callSiteWindow = source.slice(anchorIndex, anchorIndex + 400);
    expect(callSiteWindow).toContain("'payment:contract'");
  });
});
