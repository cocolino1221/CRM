import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, ILike } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import { Document, DocumentStatus, DocumentProvider } from '../database/entities/document.entity';
import { User } from '../database/entities/user.entity';
import { Contact, ContactStatus } from '../database/entities/contact.entity';
import { Deal } from '../database/entities/deal.entity';
import { Integration, IntegrationType } from '../database/entities/integration.entity';
import { NotificationType } from '../database/entities/notification.entity';
import { PandaDocIntegrationHandler } from '../integrations/handlers/pandadoc.handler';
import { DocuSignIntegrationHandler } from '../integrations/handlers/docusign.handler';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EmailService } from '../email/email.service';

export interface DocumentsListResult {
  documents: Document[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface EsemneazaTemplate {
  id: string;
  name: string;
  description?: string;
}

export interface CreateEsemneazaDocumentInput {
  name: string;
  templateId: string;
  templateName?: string;
  type: string;
  contactId?: string;
  dealId?: string;
  recipient: {
    email: string;
    name: string;
    phone?: string;
  };
  fields?: Record<string, any>;
  autoSendPaymentLink?: boolean;
  paymentAmount?: number;
  paymentCurrency?: string;
  paymentDescription?: string;
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @InjectRepository(Document)
    private documentRepository: Repository<Document>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
    @InjectRepository(Deal)
    private dealRepository: Repository<Deal>,
    @InjectRepository(Integration)
    private integrationRepository: Repository<Integration>,
    private pandaDocHandler: PandaDocIntegrationHandler,
    private docuSignHandler: DocuSignIntegrationHandler,
    private readonly httpService: HttpService,
    private readonly notificationsService: NotificationsService,
    private readonly emailService: EmailService,
    private readonly whatsAppService: WhatsAppService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(
    workspaceId: string,
    options?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: DocumentStatus;
      provider?: DocumentProvider;
      contactId?: string;
      dealId?: string;
      createdById?: string;
    }
  ): Promise<DocumentsListResult> {
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<Document> = { workspaceId };

    if (options?.search) {
      where.name = ILike(`%${options.search}%`);
    }
    if (options?.status) {
      where.status = options.status;
    }
    if (options?.provider) {
      where.provider = options.provider;
    }
    if (options?.contactId) {
      where.contactId = options.contactId;
    }
    if (options?.dealId) {
      where.dealId = options.dealId;
    }
    if (options?.createdById) {
      where.createdById = options.createdById;
    }

    const [documents, total] = await this.documentRepository.findAndCount({
      where,
      relations: ['createdBy', 'contact', 'deal', 'integration'],
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      documents,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(workspaceId: string, id: string): Promise<Document> {
    const document = await this.documentRepository.findOne({
      where: { id, workspaceId },
      relations: ['createdBy', 'contact', 'deal', 'integration'],
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    return document;
  }

  async createFromPandaDoc(
    workspaceId: string,
    userId: string,
    data: {
      name: string;
      templateId: string;
      type: string;
      contactId?: string;
      dealId?: string;
      recipients: Array<{
        email: string;
        firstName?: string;
        lastName?: string;
        role?: string;
      }>;
      tokens?: Array<{
        name: string;
        value: string;
      }>;
      fields?: Record<string, any>;
      autoSend?: boolean;
    }
  ): Promise<Document> {
    // Get PandaDoc integration
    const integration = await this.integrationRepository.findOne({
      where: {
        workspaceId,
        type: IntegrationType.PANDADOC,
      },
    });

    if (!integration || !integration.credentials?.apiKey) {
      throw new BadRequestException('PandaDoc integration not found or not configured');
    }

    // Create document in PandaDoc
    const pandaDocDocument = await this.pandaDocHandler.createDocument(
      integration.credentials.apiKey,
      {
        name: data.name,
        templateId: data.templateId,
        recipients: data.recipients,
        tokens: data.tokens,
        fields: data.fields,
      }
    );

    // Create local document record
    const document = this.documentRepository.create({
      workspaceId,
      name: data.name,
      type: data.type as any,
      status: DocumentStatus.DRAFT,
      provider: DocumentProvider.PANDADOC,
      externalId: pandaDocDocument.id,
      documentUrl: pandaDocDocument.links?.view,
      createdById: userId,
      contactId: data.contactId,
      dealId: data.dealId,
      integrationId: integration.id,
      template: {
        id: data.templateId,
        name: pandaDocDocument.template?.name,
      },
      recipients: data.recipients.map(r => ({
        email: r.email,
        name: `${r.firstName || ''} ${r.lastName || ''}`.trim(),
        role: r.role,
        status: 'pending' as const,
      })),
      fields: data.fields,
    });

    const savedDocument = await this.documentRepository.save(document) as Document;

    // Auto-send if requested
    if (data.autoSend) {
      await this.sendDocument(workspaceId, savedDocument.id, userId);
    }

    return savedDocument;
  }

  async createFromDocuSign(
    workspaceId: string,
    userId: string,
    data: {
      name: string;
      templateId: string;
      type: string;
      contactId?: string;
      dealId?: string;
      recipients: Array<{
        email: string;
        name: string;
        roleName?: string;
      }>;
      tabs?: Record<string, any>;
      autoSend?: boolean;
    }
  ): Promise<Document> {
    // Get DocuSign integration
    const integration = await this.integrationRepository.findOne({
      where: {
        workspaceId,
        type: IntegrationType.DOCUSIGN,
      },
    });

    if (!integration || !integration.credentials?.accessToken) {
      throw new BadRequestException('DocuSign integration not found or not configured');
    }

    const { baseUri, accountId } = integration.config || {};
    if (!baseUri || !accountId) {
      throw new BadRequestException('DocuSign integration not properly configured');
    }

    // Create envelope in DocuSign
    const envelope = await this.docuSignHandler.createEnvelope(
      integration.credentials.accessToken,
      baseUri,
      accountId,
      {
        templateId: data.templateId,
        emailSubject: data.name,
        recipients: data.recipients,
        tabs: data.tabs,
        status: data.autoSend ? 'sent' : 'created',
      }
    );

    // Create local document record
    const document = this.documentRepository.create({
      workspaceId,
      name: data.name,
      type: data.type as any,
      status: data.autoSend ? DocumentStatus.SENT : DocumentStatus.DRAFT,
      provider: DocumentProvider.DOCUSIGN,
      externalId: envelope.envelopeId,
      documentUrl: envelope.uri,
      createdById: userId,
      contactId: data.contactId,
      dealId: data.dealId,
      integrationId: integration.id,
      template: {
        id: data.templateId,
      },
      recipients: data.recipients.map(r => ({
        email: r.email,
        name: r.name,
        role: r.roleName,
        status: data.autoSend ? ('sent' as const) : ('pending' as const),
      })),
    });

    if (data.autoSend) {
      document.sentAt = new Date();
    }

    return await this.documentRepository.save(document) as Document;
  }

  async getEsemneazaTemplates(workspaceId: string): Promise<EsemneazaTemplate[]> {
    const integration = await this.findApiProviderIntegration(workspaceId, ['esemneaza']);
    if (!integration) {
      return [];
    }

    const configuredTemplates = this.extractConfiguredTemplates(integration);
    if (configuredTemplates.length > 0) {
      return configuredTemplates;
    }

    const apiUrl = this.getFirstNonEmpty(
      integration.config?.apiUrl,
      integration.config?.baseUrl,
    );
    if (!apiUrl) {
      return [];
    }

    const endpoint = integration.config?.listTemplatesPath || '/templates';
    try {
      const response = await this.httpService.axiosRef.get(
        `${apiUrl}${endpoint}`,
        {
          headers: this.buildProviderHeaders(integration),
        },
      );

      const rows = Array.isArray(response.data?.templates)
        ? response.data.templates
        : Array.isArray(response.data?.data)
          ? response.data.data
          : Array.isArray(response.data)
            ? response.data
            : [];

      return rows
        .map((row: any) => ({
          id: String(row.id || row.templateId || row.uuid || '').trim(),
          name: String(row.name || row.title || row.templateName || '').trim(),
          description: row.description ? String(row.description) : undefined,
        }))
        .filter((t: EsemneazaTemplate) => !!t.id && !!t.name);
    } catch (error) {
      this.logger.warn(`Could not fetch eSemneaza templates from API: ${error.message}`);
      return [];
    }
  }

  async createFromEsemneaza(
    workspaceId: string,
    userId: string,
    data: CreateEsemneazaDocumentInput,
  ): Promise<Document> {
    const integration = await this.findApiProviderIntegration(workspaceId, ['esemneaza'], true);

    let contact: Contact | null = null;
    if (data.contactId) {
      contact = await this.contactRepository.findOne({
        where: { id: data.contactId, workspaceId },
      });
      if (!contact) {
        throw new NotFoundException('Contact not found');
      }
    }

    let deal: Deal | null = null;
    if (data.dealId) {
      deal = await this.dealRepository.findOne({
        where: { id: data.dealId, workspaceId },
      });
      if (!deal) {
        throw new NotFoundException('Deal not found');
      }
    }

    const signingResult = await this.createEsemneazaSigningRequest(integration, data, workspaceId, userId);

    const paymentAmount =
      data.paymentAmount ??
      ((typeof deal?.value === 'number' ? Number(deal.value) : Number(deal?.value || 0)) || 0);
    const paymentCurrency = data.paymentCurrency || deal?.currency || 'EUR';

    const document = this.documentRepository.create({
      workspaceId,
      name: data.name,
      type: data.type as any,
      status: DocumentStatus.SENT,
      provider: DocumentProvider.INTERNAL,
      externalId: signingResult.externalId,
      documentUrl: signingResult.documentUrl,
      signingUrl: signingResult.signingUrl,
      createdById: userId,
      contactId: data.contactId,
      dealId: data.dealId,
      integrationId: integration.id,
      template: {
        id: data.templateId,
        name: data.templateName,
      },
      recipients: [
        {
          email: data.recipient.email,
          name: data.recipient.name,
          role: 'signer',
          status: 'sent',
          sentAt: new Date(),
        },
      ],
      fields: data.fields,
      metadata: {
        provider: 'esemneaza',
        providerPayload: signingResult.raw || {},
        payment: {
          provider: 'payfunnels',
          autoSendOnSign: data.autoSendPaymentLink !== false,
          status: 'awaiting_signature',
          amount: paymentAmount,
          currency: paymentCurrency,
          description: data.paymentDescription || `Plata pentru contract ${data.name}`,
        },
      },
      sentAt: new Date(),
    });

    document.addAuditEntry('esemneaza.sent', userId, {
      templateId: data.templateId,
      recipient: data.recipient.email,
    });

    const saved = await this.documentRepository.save(document);
    await this.notifyDocumentStakeholders(saved, {
      title: 'Contract trimis la semnat',
      message: `Contractul "${saved.name}" a fost trimis către ${data.recipient.email}.`,
    });

    return saved;
  }

  async generatePaymentLinkForDocument(
    workspaceId: string,
    documentId: string,
    userId: string,
    options?: {
      amount?: number;
      currency?: string;
      description?: string;
      sendEmail?: boolean;
    },
  ): Promise<Document> {
    const document = await this.documentRepository.findOne({
      where: { id: documentId, workspaceId },
      relations: ['deal', 'contact'],
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const paymentData = (document.metadata?.payment || {}) as Record<string, any>;
    if (paymentData.status === 'paid') {
      return document;
    }

    const payfunnelIntegration = await this.findApiProviderIntegration(
      workspaceId,
      ['payfunnels', 'payfunnel'],
      true,
    );
    const paymentReference = String(paymentData.paymentReference || randomUUID());

    const amount =
      options?.amount ??
      (Number(paymentData.amount || 0) || Number(document.deal?.value || 0));
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      throw new BadRequestException('Payment amount is required and must be greater than zero');
    }

    const currency =
      options?.currency ||
      String(paymentData.currency || document.deal?.currency || 'EUR').toUpperCase();
    const description =
      options?.description ||
      paymentData.description ||
      `Plata pentru contract ${document.name}`;

    const recipient = this.getPrimaryRecipient(document);
    if (!recipient?.email) {
      throw new BadRequestException('Document recipient email is required to send payment link');
    }

    const paymentLink = await this.createPayfunnelPaymentLink(
      payfunnelIntegration,
      {
        amount,
        currency,
        description,
        customerEmail: recipient.email,
        customerName: recipient.name || document.contact?.fullName,
        metadata: {
          workspaceId,
          documentId: document.id,
          dealId: document.dealId,
          paymentReference,
        },
      },
    );

    document.metadata = {
      ...document.metadata,
      payment: {
        ...paymentData,
        provider: 'payfunnels',
        status: 'pending',
        amount,
        currency,
        description,
        paymentLink: paymentLink.url,
        paymentReference,
        externalPaymentId: paymentLink.externalPaymentId,
        updatedAt: new Date(),
      },
    };
    document.addAuditEntry('payfunnels.link_created', userId, {
      amount,
      currency,
      paymentReference,
      externalPaymentId: paymentLink.externalPaymentId,
    });

    const saved = await this.documentRepository.save(document);

    const shouldSendEmail = options?.sendEmail !== false;
    if (shouldSendEmail && paymentLink.url) {
      await this.emailService.sendEmail({
        to: recipient.email,
        subject: `Link de plata pentru ${saved.name}`,
        html: `
          <p>Buna${recipient.name ? `, ${recipient.name}` : ''},</p>
          <p>Contractul a fost semnat. Poti finaliza plata folosind link-ul de mai jos:</p>
          <p><a href="${paymentLink.url}">${paymentLink.url}</a></p>
          <p>Multumim.</p>
        `,
        text: `Contractul a fost semnat. Finalizeaza plata aici: ${paymentLink.url}`,
      });
    }

    await this.notifyDocumentStakeholders(saved, {
      title: 'Link de plata trimis',
      message: `A fost generat si trimis linkul de plata pentru documentul "${saved.name}".`,
    });

    return saved;
  }

  async processEsemneazaWebhook(
    integrationId: string,
    payload: any,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ success: boolean; message: string; documentId?: string }> {
    const integration = await this.assertProviderIntegration(integrationId, ['esemneaza']);
    this.verifyWebhookSecret(integration, headers, ['x-esemneaza-token', 'x-webhook-token']);

    const signerEmailFromPayload = this.extractSignerEmailFromPayload(payload);
    const signerPhoneFromPayload = this.extractSignerPhoneFromPayload(payload);

    const externalId =
      String(
        payload?.documentId ||
        payload?.contractId ||
        payload?.id ||
        payload?.data?.documentId ||
        payload?.data?.contractId ||
        payload?.data?.id ||
        '',
      ).trim();

    if (!externalId) {
      throw new BadRequestException('Missing eSemneaza document identifier in webhook payload');
    }

    const document = await this.documentRepository.findOne({
      where: {
        workspaceId: integration.workspaceId,
        integrationId: integration.id,
        externalId,
      },
      relations: ['deal', 'contact'],
    });

    if (!document) {
      return { success: true, message: 'Document not found for this webhook payload' };
    }

    let resolvedContact = await this.resolveWebhookContact(integration.workspaceId, document, signerEmailFromPayload);
    if (resolvedContact && document.contactId !== resolvedContact.id) {
      document.contactId = resolvedContact.id;
      document.contact = resolvedContact;
    }

    const event =
      String(payload?.event || payload?.type || payload?.status || payload?.data?.status || '')
        .toLowerCase()
        .trim();

    if (this.isSignedEvent(event)) {
      const targetContactStatus = this.resolveSignedContactStatus(
        integration.config?.signedContactStatus || integration.config?.contactStatusOnSigned,
      );

      if (resolvedContact) {
        resolvedContact = await this.updateContactStatusAfterSignature(
          resolvedContact,
          targetContactStatus,
          document.id,
        );
      }

      document.markAsCompleted();
      document.metadata = {
        ...document.metadata,
        provider: 'esemneaza',
        providerEvent: event,
      };
      document.addAuditEntry('esemneaza.signed', 'webhook', { event });
      const savedDocument = await this.documentRepository.save(document);

      await this.notifyDocumentStakeholders(savedDocument, {
        title: 'Contract semnat',
        message: `Documentul "${savedDocument.name}" a fost semnat.`,
      });

      const autoSendPayment = (savedDocument.metadata?.payment as any)?.autoSendOnSign !== false;
      let paymentLink: string | undefined;
      if (autoSendPayment) {
        try {
          const paymentDocument = await this.generatePaymentLinkForDocument(
            integration.workspaceId,
            savedDocument.id,
            savedDocument.createdById || 'system',
            { sendEmail: false },
          );
          paymentLink = paymentDocument.metadata?.payment?.paymentLink;
        } catch (error) {
          this.logger.error(`Auto payment link generation failed: ${error.message}`);
          await this.notifyDocumentStakeholders(savedDocument, {
            title: 'Eroare generare link plata',
            message: `Contractul este semnat, dar linkul de plata nu a putut fi generat: ${error.message}`,
          });
        }
      }

      await this.sendPostSignatureSequence({
        workspaceId: integration.workspaceId,
        document: savedDocument,
        email: signerEmailFromPayload || this.getPrimaryRecipient(savedDocument).email,
        phone: resolvedContact?.phone || signerPhoneFromPayload,
        contactName: resolvedContact?.fullName || this.getPrimaryRecipient(savedDocument).name,
        paymentLink,
      });

      return {
        success: true,
        message: 'Document marked as signed and follow-up sequence triggered',
        documentId: savedDocument.id,
      };
    }

    if (this.isViewedEvent(event)) {
      document.markAsViewed();
      document.addAuditEntry('esemneaza.viewed', 'webhook', { event });
      await this.documentRepository.save(document);
      return { success: true, message: 'Document marked as viewed', documentId: document.id };
    }

    if (this.isDeclinedEvent(event)) {
      document.status = DocumentStatus.DECLINED;
      document.addAuditEntry('esemneaza.declined', 'webhook', { event });
      await this.documentRepository.save(document);
      await this.notifyDocumentStakeholders(document, {
        title: 'Contract respins',
        message: `Documentul "${document.name}" a fost respins la semnare.`,
      });
      return { success: true, message: 'Document marked as declined', documentId: document.id };
    }

    return { success: true, message: `Unhandled webhook event: ${event}`, documentId: document.id };
  }

  async processPayfunnelWebhook(
    integrationId: string,
    payload: any,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<{ success: boolean; message: string; documentId?: string }> {
    const integration = await this.assertProviderIntegration(integrationId, ['payfunnels', 'payfunnel']);
    this.verifyWebhookSecret(integration, headers, ['x-payfunnel-token', 'x-webhook-token']);

    const eventName = String(payload?.event || payload?.type || '').toLowerCase();
    const statusRaw = String(
      payload?.status ||
      payload?.paymentStatus ||
      payload?.data?.status ||
      payload?.data?.paymentStatus ||
      eventName,
    ).toLowerCase();

    const metadata = payload?.metadata || payload?.data?.metadata || {};
    const documentId = String(metadata?.documentId || payload?.documentId || payload?.data?.documentId || '').trim();
    const paymentReference = String(
      metadata?.paymentReference ||
      payload?.paymentReference ||
      payload?.reference ||
      payload?.data?.paymentReference ||
      '',
    ).trim();
    const externalPaymentId = String(
      payload?.paymentId || payload?.id || payload?.data?.paymentId || payload?.data?.id || '',
    ).trim();

    let document: Document | null = null;
    if (documentId) {
      document = await this.documentRepository.findOne({
        where: { id: documentId, workspaceId: integration.workspaceId },
        relations: ['deal', 'contact'],
      });
    }

    if (!document && paymentReference) {
      document = await this.documentRepository
        .createQueryBuilder('document')
        .leftJoinAndSelect('document.deal', 'deal')
        .leftJoinAndSelect('document.contact', 'contact')
        .where('document.workspaceId = :workspaceId', { workspaceId: integration.workspaceId })
        .andWhere(`document.metadata->'payment'->>'paymentReference' = :paymentReference`, { paymentReference })
        .getOne();
    }

    if (!document && externalPaymentId) {
      document = await this.documentRepository
        .createQueryBuilder('document')
        .leftJoinAndSelect('document.deal', 'deal')
        .leftJoinAndSelect('document.contact', 'contact')
        .where('document.workspaceId = :workspaceId', { workspaceId: integration.workspaceId })
        .andWhere(`document.metadata->'payment'->>'externalPaymentId' = :externalPaymentId`, { externalPaymentId })
        .getOne();
    }

    if (!document) {
      return { success: true, message: 'Document not found for payment webhook' };
    }

    const paymentMetadata = { ...(document.metadata?.payment || {}) } as Record<string, any>;
    const normalizedFailureReason = String(
      payload?.failureReason ||
      payload?.reason ||
      payload?.data?.failureReason ||
      payload?.data?.reason ||
      '',
    ).trim();

    const isPaid = this.isPaymentSuccess(statusRaw, eventName);
    const isFailed = this.isPaymentFailure(statusRaw, eventName);

    if (isPaid) {
      document.metadata = {
        ...document.metadata,
        payment: {
          ...paymentMetadata,
          status: 'paid',
          paidAt: new Date(),
          externalPaymentId: externalPaymentId || paymentMetadata.externalPaymentId,
          paymentReference: paymentReference || paymentMetadata.paymentReference,
          rawPayload: payload,
        },
      };
      document.addAuditEntry('payfunnels.paid', 'webhook', {
        externalPaymentId,
        paymentReference,
      });
      await this.documentRepository.save(document);

      this.eventEmitter.emit('payment.received', {
        workspaceId: integration.workspaceId,
        documentId: document.id,
        dealId: document.dealId,
        amount: Number(payload?.amount || payload?.data?.amount || paymentMetadata.amount || 0),
        currency: payload?.currency || payload?.data?.currency || paymentMetadata.currency,
        status: 'paid',
      });

      await this.notifyDocumentStakeholders(document, {
        title: 'Plata confirmata',
        message: `Documentul "${document.name}" a fost marcat ca platit.`,
      });

      return { success: true, message: 'Payment marked as paid', documentId: document.id };
    }

    if (isFailed) {
      document.metadata = {
        ...document.metadata,
        payment: {
          ...paymentMetadata,
          status: 'failed',
          failedAt: new Date(),
          failureReason: normalizedFailureReason || 'Payment failed',
          externalPaymentId: externalPaymentId || paymentMetadata.externalPaymentId,
          paymentReference: paymentReference || paymentMetadata.paymentReference,
          rawPayload: payload,
        },
      };
      document.addAuditEntry('payfunnels.failed', 'webhook', {
        externalPaymentId,
        paymentReference,
        reason: normalizedFailureReason,
      });
      await this.documentRepository.save(document);

      await this.notifyDocumentStakeholders(document, {
        title: 'Plata esuata',
        message: `Plata pentru "${document.name}" a esuat${normalizedFailureReason ? `: ${normalizedFailureReason}` : '.'}`,
      });

      return { success: true, message: 'Payment marked as failed', documentId: document.id };
    }

    return { success: true, message: 'Payment webhook ignored', documentId: document.id };
  }

  async sendDocument(
    workspaceId: string,
    documentId: string,
    userId: string,
    options?: {
      message?: string;
      subject?: string;
    }
  ): Promise<Document> {
    const document = await this.findOne(workspaceId, documentId);

    if (document.status !== DocumentStatus.DRAFT && document.status !== DocumentStatus.PENDING) {
      throw new BadRequestException('Document has already been sent or completed');
    }

    const integration = await this.integrationRepository.findOne({
      where: { id: document.integrationId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    try {
      if (document.provider === DocumentProvider.PANDADOC) {
        await this.pandaDocHandler.sendDocument(
          integration.credentials?.apiKey,
          document.externalId,
          options
        );
      } else if (document.provider === DocumentProvider.DOCUSIGN) {
        // DocuSign sends on creation if status is 'sent'
        // For drafts, we need to update status
        const { baseUri, accountId } = integration.config || {};
        await this.docuSignHandler.createEnvelope(
          integration.credentials?.accessToken,
          baseUri,
          accountId,
          {
            templateId: document.template?.id,
            emailSubject: options?.subject || document.name,
            recipients: document.recipients.map(r => ({
              email: r.email,
              name: r.name,
              roleName: r.role,
            })),
            status: 'sent',
          }
        );
      }

      document.markAsSent();
      return await this.documentRepository.save(document);
    } catch (error) {
      this.logger.error(`Failed to send document: ${error.message}`);
      throw new BadRequestException(`Failed to send document: ${error.message}`);
    }
  }

  async voidDocument(
    workspaceId: string,
    documentId: string,
    userId: string,
    reason?: string
  ): Promise<Document> {
    const document = await this.findOne(workspaceId, documentId);

    if (document.isCompleted) {
      throw new BadRequestException('Cannot void a completed document');
    }

    const integration = await this.integrationRepository.findOne({
      where: { id: document.integrationId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    try {
      if (document.provider === DocumentProvider.PANDADOC) {
        await this.pandaDocHandler.voidDocument(
          integration.credentials?.apiKey,
          document.externalId
        );
      } else if (document.provider === DocumentProvider.DOCUSIGN) {
        const { baseUri, accountId } = integration.config || {};
        await this.docuSignHandler.voidEnvelope(
          integration.credentials?.accessToken,
          baseUri,
          accountId,
          document.externalId,
          reason || 'Voided by user'
        );
      }

      document.void(reason);
      return await this.documentRepository.save(document);
    } catch (error) {
      this.logger.error(`Failed to void document: ${error.message}`);
      throw new BadRequestException(`Failed to void document: ${error.message}`);
    }
  }

  async syncDocument(workspaceId: string, documentId: string): Promise<Document> {
    const document = await this.findOne(workspaceId, documentId);

    const integration = await this.integrationRepository.findOne({
      where: { id: document.integrationId },
    });

    if (!integration) {
      throw new NotFoundException('Integration not found');
    }

    try {
      let externalDocument: any;

      if (document.provider === DocumentProvider.PANDADOC) {
        externalDocument = await this.pandaDocHandler.getDocument(
          integration.credentials?.apiKey,
          document.externalId
        );

        // Update document status
        document.status = this.mapPandaDocStatus(externalDocument.status);
        if (externalDocument.date_completed) {
          document.signedAt = new Date(externalDocument.date_completed);
        }
      } else if (document.provider === DocumentProvider.DOCUSIGN) {
        const { baseUri, accountId } = integration.config || {};
        externalDocument = await this.docuSignHandler.getEnvelope(
          integration.credentials?.accessToken,
          baseUri,
          accountId,
          document.externalId
        );

        // Update document status
        document.status = this.mapDocuSignStatus(externalDocument.status);
        if (externalDocument.completedDateTime) {
          document.signedAt = new Date(externalDocument.completedDateTime);
        }
      }

      document.metadata = {
        ...document.metadata,
        lastSynced: new Date(),
        externalData: externalDocument,
      };

      return await this.documentRepository.save(document);
    } catch (error) {
      this.logger.error(`Failed to sync document: ${error.message}`);
      throw new BadRequestException(`Failed to sync document: ${error.message}`);
    }
  }

  async deleteDocument(workspaceId: string, documentId: string): Promise<void> {
    const document = await this.findOne(workspaceId, documentId);
    await this.documentRepository.remove(document);
  }

  private async findApiProviderIntegration(
    workspaceId: string,
    providerKeys: string[],
    throwIfMissing = false,
  ): Promise<Integration | null> {
    const normalized = providerKeys.map((key) => key.toLowerCase());

    const qb = this.integrationRepository
      .createQueryBuilder('integration')
      .where('integration.workspaceId = :workspaceId', { workspaceId })
      .andWhere('integration.type = :type', { type: IntegrationType.API })
      .andWhere('integration.isEnabled = true')
      .andWhere(
        `(LOWER(COALESCE(integration."externalId", '')) IN (:...keys)
          OR LOWER(COALESCE(integration.config->>'provider', '')) IN (:...keys))`,
        { keys: normalized },
      )
      .orderBy('integration.updatedAt', 'DESC');

    const integration = await qb.getOne();
    if (!integration && throwIfMissing) {
      throw new BadRequestException(
        `Integration ${providerKeys[0]} is not connected. Configure it in Integrations first.`,
      );
    }
    return integration || null;
  }

  private async assertProviderIntegration(
    integrationId: string,
    providerKeys: string[],
  ): Promise<Integration> {
    const integration = await this.integrationRepository.findOne({
      where: { id: integrationId },
    });
    if (!integration) {
      throw new NotFoundException('Integration not found');
    }
    const normalized = providerKeys.map((key) => key.toLowerCase());
    const externalId = String(integration.externalId || '').toLowerCase();
    const provider = String(integration.config?.provider || '').toLowerCase();
    if (
      integration.type !== IntegrationType.API ||
      (!normalized.includes(externalId) && !normalized.includes(provider))
    ) {
      throw new BadRequestException('Integration is not configured for this provider');
    }
    return integration;
  }

  private extractConfiguredTemplates(integration: Integration): EsemneazaTemplate[] {
    const fromConfig = integration.config?.templates ?? integration.config?.templateCatalog;
    const rawRows = this.normalizeListInput(fromConfig);
    return rawRows
      .map((row: any) => ({
        id: String(row.id || row.templateId || row.uuid || '').trim(),
        name: String(row.name || row.title || row.templateName || '').trim(),
        description: row.description ? String(row.description) : undefined,
      }))
      .filter((row: EsemneazaTemplate) => !!row.id && !!row.name);
  }

  private async createEsemneazaSigningRequest(
    integration: Integration,
    data: CreateEsemneazaDocumentInput,
    workspaceId: string,
    userId: string,
  ): Promise<{ externalId: string; signingUrl: string; documentUrl?: string; raw?: any }> {
    const apiUrl = this.getFirstNonEmpty(integration.config?.apiUrl, integration.config?.baseUrl);
    const endpoint = integration.config?.sendContractPath || '/contracts/send';
    const payload = {
      name: data.name,
      templateId: data.templateId,
      recipient: {
        email: data.recipient.email,
        name: data.recipient.name,
        phone: data.recipient.phone,
      },
      fields: data.fields || {},
      metadata: {
        workspaceId,
        userId,
        contactId: data.contactId,
        dealId: data.dealId,
      },
    };

    if (apiUrl) {
      try {
        const response = await this.httpService.axiosRef.post(
          `${apiUrl}${endpoint}`,
          payload,
          {
            headers: this.buildProviderHeaders(integration),
          },
        );

        const externalId = String(
          response.data?.id ||
          response.data?.documentId ||
          response.data?.contractId ||
          response.data?.uuid ||
          '',
        ).trim();
        const signingUrl = String(
          response.data?.signingUrl ||
          response.data?.signUrl ||
          response.data?.url ||
          '',
        ).trim();

        if (!externalId || !signingUrl) {
          throw new Error('eSemneaza response missing document id or signing URL');
        }

        return {
          externalId,
          signingUrl,
          documentUrl: response.data?.documentUrl,
          raw: response.data,
        };
      } catch (error) {
        this.logger.error(`Failed to create eSemneaza signing request: ${error.message}`);
        throw new BadRequestException(`eSemneaza signing failed: ${error.message}`);
      }
    }

    const signingBaseUrl = this.getFirstNonEmpty(
      integration.config?.signingBaseUrl,
      integration.config?.appUrl,
    );
    if (!signingBaseUrl) {
      throw new BadRequestException(
        'eSemneaza integration is missing apiUrl or signingBaseUrl in configuration',
      );
    }

    const localExternalId = randomUUID();
    return {
      externalId: localExternalId,
      signingUrl: `${signingBaseUrl.replace(/\/$/, '')}/${localExternalId}`,
      raw: { mode: 'fallback_url' },
    };
  }

  private async createPayfunnelPaymentLink(
    integration: Integration,
    input: {
      amount: number;
      currency: string;
      description: string;
      customerEmail: string;
      customerName?: string;
      metadata?: Record<string, any>;
    },
  ): Promise<{ url: string; externalPaymentId?: string; raw?: any }> {
    const apiUrl = this.getFirstNonEmpty(integration.config?.apiUrl, integration.config?.baseUrl);
    const endpoint = integration.config?.createPaymentPath || '/payments/links';
    const payload = {
      amount: input.amount,
      currency: input.currency,
      description: input.description,
      customer: {
        email: input.customerEmail,
        name: input.customerName,
      },
      metadata: input.metadata || {},
    };

    if (apiUrl) {
      try {
        const response = await this.httpService.axiosRef.post(
          `${apiUrl}${endpoint}`,
          payload,
          {
            headers: this.buildProviderHeaders(integration),
          },
        );

        const url = String(
          response.data?.paymentUrl ||
          response.data?.checkoutUrl ||
          response.data?.url ||
          response.data?.link ||
          '',
        ).trim();
        if (!url) {
          throw new Error('PayFunnels response missing payment URL');
        }

        return {
          url,
          externalPaymentId: response.data?.paymentId || response.data?.id,
          raw: response.data,
        };
      } catch (error) {
        this.logger.error(`Failed to create PayFunnels payment link: ${error.message}`);
        throw new BadRequestException(`PayFunnels link creation failed: ${error.message}`);
      }
    }

    const checkoutBaseUrl = this.getFirstNonEmpty(
      integration.config?.checkoutBaseUrl,
      integration.config?.appUrl,
      integration.config?.paymentBaseUrl,
    );
    if (!checkoutBaseUrl) {
      throw new BadRequestException(
        'PayFunnels integration is missing apiUrl or checkoutBaseUrl in configuration',
      );
    }

    const paymentId = randomUUID();
    const reference = encodeURIComponent(String(input.metadata?.paymentReference || paymentId));
    return {
      url: `${checkoutBaseUrl.replace(/\/$/, '')}/checkout/${paymentId}?ref=${reference}`,
      externalPaymentId: paymentId,
      raw: { mode: 'fallback_url' },
    };
  }

  private extractSignerEmailFromPayload(payload: any): string | undefined {
    const candidates = [
      payload?.email,
      payload?.recipientEmail,
      payload?.signerEmail,
      payload?.recipient?.email,
      payload?.signer?.email,
      payload?.data?.email,
      payload?.data?.recipientEmail,
      payload?.data?.signerEmail,
      payload?.data?.recipient?.email,
      payload?.data?.signer?.email,
    ];

    for (const value of candidates) {
      if (typeof value === 'string' && value.includes('@')) {
        return value.trim().toLowerCase();
      }
    }
    return undefined;
  }

  private extractSignerPhoneFromPayload(payload: any): string | undefined {
    const candidates = [
      payload?.phone,
      payload?.recipientPhone,
      payload?.signerPhone,
      payload?.recipient?.phone,
      payload?.signer?.phone,
      payload?.data?.phone,
      payload?.data?.recipientPhone,
      payload?.data?.signerPhone,
      payload?.data?.recipient?.phone,
      payload?.data?.signer?.phone,
    ];

    for (const value of candidates) {
      if (typeof value === 'string' && value.trim().length >= 7) {
        return value.trim();
      }
    }
    return undefined;
  }

  private async resolveWebhookContact(
    workspaceId: string,
    document: Document,
    emailFromPayload?: string,
  ): Promise<Contact | null> {
    if (document.contactId) {
      const byId = await this.contactRepository.findOne({
        where: { id: document.contactId, workspaceId },
      });
      if (byId) return byId;
    }

    const fallbackEmail = emailFromPayload || this.getPrimaryRecipient(document).email;
    if (!fallbackEmail) return null;

    return this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.workspaceId = :workspaceId', { workspaceId })
      .andWhere('LOWER(contact.email) = :email', { email: fallbackEmail.toLowerCase() })
      .orderBy('contact.updatedAt', 'DESC')
      .getOne();
  }

  private resolveSignedContactStatus(rawValue?: string): ContactStatus {
    const normalized = String(rawValue || '').trim().toLowerCase();
    const allowed = new Set<string>(Object.values(ContactStatus));
    if (allowed.has(normalized)) {
      return normalized as ContactStatus;
    }
    return ContactStatus.CUSTOMER;
  }

  private async updateContactStatusAfterSignature(
    contact: Contact,
    status: ContactStatus,
    documentId: string,
  ): Promise<Contact> {
    if (contact.status === status) {
      return contact;
    }

    contact.status = status;
    contact.lastContactedAt = new Date();
    const updated = await this.contactRepository.save(contact);

    this.eventEmitter.emit('contact.updated', {
      workspaceId: updated.workspaceId,
      contact: updated,
      changes: {
        status,
        source: 'esemneaza.webhook',
        documentId,
      },
    });

    return updated;
  }

  private async sendPostSignatureSequence(params: {
    workspaceId: string;
    document: Document;
    email?: string;
    phone?: string;
    contactName?: string;
    paymentLink?: string;
  }): Promise<void> {
    const paymentLink =
      params.paymentLink ||
      (params.document.metadata?.payment as Record<string, any> | undefined)?.paymentLink;

    if (!paymentLink) {
      this.logger.warn(`Post-signature sequence skipped for ${params.document.id}: missing payment link`);
      return;
    }

    const greetingName = params.contactName ? `, ${params.contactName}` : '';
    const emailTarget = params.email?.trim();
    if (emailTarget) {
      await this.emailService.sendEmail({
        to: emailTarget,
        subject: `Contract semnat - link plata pentru ${params.document.name}`,
        html: `
          <p>Buna${greetingName},</p>
          <p>Contractul "${params.document.name}" a fost semnat cu succes.</p>
          <p>Te rugam sa finalizezi plata aici:</p>
          <p><a href="${paymentLink}">${paymentLink}</a></p>
          <p>Multumim.</p>
        `,
        text: `Contractul "${params.document.name}" a fost semnat. Finalizeaza plata aici: ${paymentLink}`,
      });
    }

    const phoneTarget = params.phone?.trim();
    if (phoneTarget) {
      try {
        await this.whatsAppService.sendMessageForWorkspace(params.workspaceId, {
          to: phoneTarget,
          type: 'text',
          content: `Contractul "${params.document.name}" a fost semnat. Link plata: ${paymentLink}`,
        });
      } catch (error) {
        this.logger.warn(`WhatsApp sequence failed for document ${params.document.id}: ${error.message}`);
        await this.notifyDocumentStakeholders(params.document, {
          title: 'WhatsApp netrimis',
          message: `Contractul este semnat, dar mesajul WhatsApp nu a fost trimis: ${error.message}`,
        });
      }
    }
  }

  private buildProviderHeaders(integration: Integration): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(integration.config?.headers || {}),
    };

    const apiKey =
      integration.credentials?.apiKey ||
      integration.credentials?.apiToken ||
      integration.config?.apiKey ||
      integration.config?.token;

    if (apiKey) {
      const authScheme = String(integration.config?.authScheme || 'Bearer').trim();
      if (authScheme.toLowerCase() === 'api-key') {
        headers['X-API-Key'] = apiKey;
      } else if (authScheme.toLowerCase() === 'token') {
        headers['Authorization'] = `Token ${apiKey}`;
      } else {
        headers['Authorization'] = `${authScheme} ${apiKey}`.trim();
      }
    }

    return headers;
  }

  private normalizeListInput(raw: any): any[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    return [];
  }

  private getFirstNonEmpty(...values: Array<string | undefined | null>): string | undefined {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return undefined;
  }

  private getPrimaryRecipient(document: Document): { email?: string; name?: string } {
    if (!Array.isArray(document.recipients) || document.recipients.length === 0) {
      return { email: document.contact?.email, name: document.contact?.fullName };
    }
    return {
      email: document.recipients[0]?.email,
      name: document.recipients[0]?.name,
    };
  }

  private async notifyDocumentStakeholders(
    document: Document,
    payload: { title: string; message: string; link?: string },
  ): Promise<void> {
    const userIds = await this.getStakeholderUserIds(document);
    if (userIds.length === 0) return;

    await Promise.allSettled(
      userIds.map((userId) =>
        this.notificationsService.create(document.workspaceId, {
          type: NotificationType.SYSTEM,
          title: payload.title,
          message: payload.message,
          userId,
          link: payload.link || `/documents/${document.id}`,
          metadata: {
            documentId: document.id,
            dealId: document.dealId,
            contactId: document.contactId,
          },
        }),
      ),
    );
  }

  private async getStakeholderUserIds(document: Document): Promise<string[]> {
    const ids = new Set<string>();
    if (document.createdById) ids.add(document.createdById);

    let dealOwnerId = document.deal?.ownerId;
    if (!dealOwnerId && document.dealId) {
      const deal = await this.dealRepository.findOne({
        where: { id: document.dealId, workspaceId: document.workspaceId },
      });
      dealOwnerId = deal?.ownerId;
    }
    if (dealOwnerId) ids.add(dealOwnerId);

    let contactOwnerId = document.contact?.ownerId;
    if (!contactOwnerId && document.contactId) {
      const contact = await this.contactRepository.findOne({
        where: { id: document.contactId, workspaceId: document.workspaceId },
      });
      contactOwnerId = contact?.ownerId;
    }
    if (contactOwnerId) ids.add(contactOwnerId);

    return [...ids];
  }

  private verifyWebhookSecret(
    integration: Integration,
    headers: Record<string, string | string[] | undefined>,
    preferredKeys: string[] = [],
  ): void {
    const expectedSecret =
      integration.config?.webhookSecret ||
      integration.credentials?.webhookSecret ||
      integration.credentials?.apiSecret;

    if (!expectedSecret) {
      return;
    }

    const candidates = [
      ...preferredKeys,
      'x-signature',
      'x-webhook-signature',
      'authorization',
    ];

    let provided: string | undefined;
    for (const key of candidates) {
      const value = this.readHeader(headers, key);
      if (value) {
        provided = value;
        break;
      }
    }

    if (provided?.toLowerCase().startsWith('bearer ')) {
      provided = provided.substring(7).trim();
    }

    if (!provided || provided !== expectedSecret) {
      throw new UnauthorizedException('Invalid webhook secret');
    }
  }

  private readHeader(
    headers: Record<string, string | string[] | undefined>,
    key: string,
  ): string | undefined {
    const loweredKey = key.toLowerCase();
    const raw = Object.keys(headers).find((h) => h.toLowerCase() === loweredKey);
    if (!raw) return undefined;
    const value = headers[raw];
    if (Array.isArray(value)) return value[0];
    return value;
  }

  private isSignedEvent(event: string): boolean {
    return ['signed', 'completed', 'document.signed', 'contract.signed', 'done'].some((token) =>
      event.includes(token),
    );
  }

  private isViewedEvent(event: string): boolean {
    return ['viewed', 'opened', 'document.viewed'].some((token) => event.includes(token));
  }

  private isDeclinedEvent(event: string): boolean {
    return ['declined', 'rejected', 'voided', 'expired'].some((token) => event.includes(token));
  }

  private isPaymentSuccess(status: string, eventName: string): boolean {
    return ['paid', 'succeeded', 'success', 'completed'].some(
      (token) => status.includes(token) || eventName.includes(token),
    );
  }

  private isPaymentFailure(status: string, eventName: string): boolean {
    return ['failed', 'declined', 'insufficient', 'canceled', 'cancelled', 'error'].some(
      (token) => status.includes(token) || eventName.includes(token),
    );
  }

  private mapPandaDocStatus(status: string): DocumentStatus {
    const statusMap: Record<string, DocumentStatus> = {
      'document.draft': DocumentStatus.DRAFT,
      'document.sent': DocumentStatus.SENT,
      'document.viewed': DocumentStatus.VIEWED,
      'document.completed': DocumentStatus.SIGNED,
      'document.voided': DocumentStatus.VOIDED,
      'document.declined': DocumentStatus.DECLINED,
      'document.expired': DocumentStatus.EXPIRED,
    };
    return statusMap[status] || DocumentStatus.PENDING;
  }

  private mapDocuSignStatus(status: string): DocumentStatus {
    const statusMap: Record<string, DocumentStatus> = {
      'created': DocumentStatus.DRAFT,
      'sent': DocumentStatus.SENT,
      'delivered': DocumentStatus.VIEWED,
      'completed': DocumentStatus.SIGNED,
      'voided': DocumentStatus.VOIDED,
      'declined': DocumentStatus.DECLINED,
    };
    return statusMap[status.toLowerCase()] || DocumentStatus.PENDING;
  }
}
