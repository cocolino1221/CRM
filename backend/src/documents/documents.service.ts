import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, ILike, SelectQueryBuilder } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'crypto';
import FormData from 'form-data';
import { Document, DocumentStatus, DocumentProvider, DocumentType } from '../database/entities/document.entity';
import { User, UserRole, UserStatus } from '../database/entities/user.entity';
import { Contact, ContactStatus } from '../database/entities/contact.entity';
import { Deal, DealStage } from '../database/entities/deal.entity';
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
  templateId?: string;
  fileName?: string;
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
  paymentLinkUrl?: string;
  paymentLinkName?: string;
  sendPaymentEmail?: boolean;
  sendPaymentWhatsApp?: boolean;
}

export interface EsemneazaSyncResult {
  imported: number;
  updated: number;
  skipped: number;
  totalFetched: number;
  message?: string;
}

export interface EsemneazaRequestSummary {
  id: string;
  createdAt?: string;
  docName?: string;
  status?: string;
  completedAt?: string | null;
}

export interface EsemneazaTemplatePaymentAutomationRule {
  templateId: string;
  autoSendPaymentLink: boolean;
  amount?: number;
  currency?: string;
  description?: string;
  paymentLinkUrl?: string;
  paymentLinkName?: string;
}

export interface PayfunnelLinkOption {
  id: string;
  name: string;
  url: string;
  source: 'integration_config' | 'payfunnel_api';
}

export interface PaymentsListItem {
  documentId: string;
  documentName: string;
  documentStatus: DocumentStatus;
  createdAt: Date;
  signedAt?: Date;
  contact?: {
    id: string;
    name: string;
    email?: string;
    status?: ContactStatus;
  };
  deal?: {
    id: string;
    title: string;
    stage?: string;
  };
  payment: {
    status: 'paid' | 'failed' | 'pending';
    rawStatus?: string;
    amount?: number;
    currency?: string;
    paymentLink?: string;
    paidAt?: Date;
    failedAt?: Date;
    failureReason?: string;
    paymentReference?: string;
    externalPaymentId?: string;
    provider?: string;
  };
}

export interface PaymentsListResult {
  payments: PaymentsListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: {
    total: number;
    paid: number;
    failed: number;
    pending: number;
  };
}

export interface PayfunnelDashboardPayment {
  id: string;
  status: 'paid' | 'failed' | 'pending';
  paymentReference?: string;
  title?: string;
  description?: string;
  rawStatus?: string;
  failureReason?: string;
  amount?: number;
  currency?: string;
  taxAmount?: number;
  processingFeeAmount?: number;
  setupFeeAmount?: number;
  refundAmount?: number;
  quantity?: number;
  customerName?: string;
  customerId?: string;
  customerEmail?: string;
  paymentMethodType?: string;
  cardLast4?: string;
  productNames?: string[];
  subscriptionId?: string;
  subscriptionStatus?: string;
  subscriptionPlanName?: string;
  subscriptionStartedAt?: string;
  subscriptionEndsAt?: string;
  subscriptionPaidPayments?: number;
  subscriptionRemainingPayments?: number;
  subscriptionTotalPayments?: number;
  paymentLinkId?: string;
  paymentLinkName?: string;
  paymentUrl?: string;
  createdAt?: string;
  paidAt?: string;
}

export interface PayfunnelDashboardSubscription {
  id: string;
  status?: string;
  title?: string;
  customerName?: string;
  customerId?: string;
  customerEmail?: string;
  planName?: string;
  interval?: string;
  paymentType?: string;
  amount?: number;
  chargeAmount?: number;
  currency?: string;
  totalCollectedAmount?: number;
  totalSubscriptionAmount?: number;
  totalDueAmount?: number;
  totalMaxPayment?: number;
  startedAt?: string;
  nextBillingAt?: string;
  currentPeriodStartAt?: string;
  currentPeriodEndAt?: string;
  trialEndsAt?: string;
  expiresAt?: string;
  lastPaymentAt?: string;
  canceledAt?: string;
  paidPayments?: number;
  failedPayments?: number;
  remainingPayments?: number;
  totalPayments?: number;
}

export interface PayfunnelDashboardLink {
  id: string;
  name: string;
  url: string;
  status?: string;
  createdAt?: string;
  source: 'integration_config' | 'payfunnel_api' | 'crm_documents';
}

export interface PayfunnelDashboardResult {
  connected: boolean;
  apiEnabled: boolean;
  message?: string;
  errors?: string[];
  payments: PayfunnelDashboardPayment[];
  subscriptions: PayfunnelDashboardSubscription[];
  links: PayfunnelDashboardLink[];
}

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly payfunnelPaymentsRefreshAtByWorkspace = new Map<string, number>();
  private readonly payfunnelPaymentsRefreshCooldownMs = 45_000;

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

  async findPayments(
    workspaceId: string,
    options?: {
      page?: number;
      limit?: number;
      search?: string;
      status?: 'paid' | 'failed' | 'pending' | string;
    },
  ): Promise<PaymentsListResult> {
    const parsedPage = Number(options?.page);
    const parsedLimit = Number(options?.limit);
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? Math.floor(parsedPage) : 1;
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(Math.floor(parsedLimit), 100)
      : 25;
    await this.maybeRefreshPayfunnelPayments(workspaceId);

    const skip = (page - 1) * limit;
    const search = String(options?.search || '').trim();
    const statusFilter = this.normalizePaymentFilter(options?.status);

    const paymentsQuery = this.buildPaymentsBaseQuery(workspaceId, search);
    const paymentStatusExpr = "LOWER(COALESCE(document.metadata->'payment'->>'status', ''))";

    if (statusFilter === 'paid') {
      paymentsQuery.andWhere(`${paymentStatusExpr} ~ :paidRegex`, {
        paidRegex: '(paid|succeeded|success|completed)',
      });
    } else if (statusFilter === 'failed') {
      paymentsQuery.andWhere(`${paymentStatusExpr} ~ :failedRegex`, {
        failedRegex: '(failed|declined|insufficient|canceled|cancelled|error)',
      });
    } else if (statusFilter === 'pending') {
      paymentsQuery.andWhere(
        `NOT (${paymentStatusExpr} ~ :paidRegex OR ${paymentStatusExpr} ~ :failedRegex)`,
        {
          paidRegex: '(paid|succeeded|success|completed)',
          failedRegex: '(failed|declined|insufficient|canceled|cancelled|error)',
        },
      );
    }

    const [documents, total] = await paymentsQuery
      .orderBy('document.updatedAt', 'DESC')
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const summaryQuery = this.buildPaymentsBaseQuery(workspaceId, search);
    const summaryRaw = await summaryQuery
      .select('COUNT(*)', 'total')
      .addSelect(
        `SUM(CASE WHEN ${paymentStatusExpr} ~ :paidRegex THEN 1 ELSE 0 END)`,
        'paid',
      )
      .addSelect(
        `SUM(CASE WHEN ${paymentStatusExpr} ~ :failedRegex THEN 1 ELSE 0 END)`,
        'failed',
      )
      .setParameters({
        paidRegex: '(paid|succeeded|success|completed)',
        failedRegex: '(failed|declined|insufficient|canceled|cancelled|error)',
      })
      .getRawOne<{ total?: string; paid?: string; failed?: string }>();

    const summaryTotal = Number(summaryRaw?.total || 0);
    const summaryPaid = Number(summaryRaw?.paid || 0);
    const summaryFailed = Number(summaryRaw?.failed || 0);
    const summaryPending = Math.max(summaryTotal - summaryPaid - summaryFailed, 0);

    const payments: PaymentsListItem[] = documents.map((document) => {
      const paymentMetadata = { ...((document.metadata?.payment as Record<string, any>) || {}) };
      const rawStatus = String(paymentMetadata.status || '').trim();
      const normalizedStatus = this.normalizePaymentStatus(rawStatus);
      const amountFromMetadata = Number(paymentMetadata.amount);
      const fallbackAmount = Number(document.deal?.value || 0);
      const amount = Number.isFinite(amountFromMetadata) && amountFromMetadata > 0
        ? amountFromMetadata
        : (Number.isFinite(fallbackAmount) && fallbackAmount > 0 ? fallbackAmount : undefined);
      const contactName = document.contact
        ? `${document.contact.firstName || ''} ${document.contact.lastName || ''}`.trim()
        : '';

      return {
        documentId: document.id,
        documentName: document.name,
        documentStatus: document.status,
        createdAt: document.createdAt,
        signedAt: document.signedAt,
        contact: document.contact
          ? {
              id: document.contact.id,
              name: contactName || document.contact.email,
              email: document.contact.email,
              status: document.contact.status,
            }
          : undefined,
        deal: document.deal
          ? {
              id: document.deal.id,
              title: document.deal.title,
              stage: document.deal.stage,
            }
          : undefined,
        payment: {
          status: normalizedStatus,
          rawStatus: rawStatus || undefined,
          amount,
          currency: String(paymentMetadata.currency || document.deal?.currency || 'EUR').toUpperCase(),
          paymentLink: this.getFirstNonEmpty(paymentMetadata.paymentLink, paymentMetadata.preferredLinkUrl) as string | undefined,
          paidAt: paymentMetadata.paidAt ? new Date(paymentMetadata.paidAt) : undefined,
          failedAt: paymentMetadata.failedAt ? new Date(paymentMetadata.failedAt) : undefined,
          failureReason: paymentMetadata.failureReason,
          paymentReference: paymentMetadata.paymentReference,
          externalPaymentId: paymentMetadata.externalPaymentId,
          provider: paymentMetadata.provider || 'payfunnels',
        },
      };
    });

    return {
      payments,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      summary: {
        total: summaryTotal,
        paid: summaryPaid,
        failed: summaryFailed,
        pending: summaryPending,
      },
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

    const apiUrl = this.resolveProviderBaseUrl(integration);
    if (!apiUrl) {
      return [];
    }

    const endpoint = integration.config?.listTemplatesPath || '/api/v1/templates';
    try {
      const response = await this.httpService.axiosRef.get(
        this.buildProviderUrl(apiUrl, endpoint),
        {
          headers: this.buildProviderHeaders(integration),
        },
      );

      const rows = this.extractApiRows(response.data, [
        'templates',
        'items',
        'results',
        'data',
      ]);

      return rows
        .map((row: any) => ({
          id: String(row.id || row.templateId || row.uuid || '').trim(),
          name: String(row.name || row.title || row.templateName || row.docName || '').trim(),
          description: row.description ? String(row.description) : undefined,
        }))
        .filter((t: EsemneazaTemplate) => !!t.id && !!t.name);
    } catch (error) {
      this.logger.warn(`Could not fetch eSemneaza templates from API: ${error.message}`);
      return [];
    }
  }

  async getEsemneazaTemplatePaymentAutomation(
    workspaceId: string,
  ): Promise<{ rules: EsemneazaTemplatePaymentAutomationRule[] }> {
    const integration = await this.findApiProviderIntegration(workspaceId, ['esemneaza']);
    if (!integration) {
      return { rules: [] };
    }
    return {
      rules: this.extractEsemneazaTemplatePaymentRules(integration),
    };
  }

  async updateEsemneazaTemplatePaymentAutomation(
    workspaceId: string,
    rules: Array<{
      templateId: string;
      autoSendPaymentLink?: boolean;
      amount?: number;
      currency?: string;
      description?: string;
      paymentLinkUrl?: string;
      paymentLinkName?: string;
      linkUrl?: string;
      url?: string;
      linkName?: string;
      name?: string;
    }>,
  ): Promise<{ rules: EsemneazaTemplatePaymentAutomationRule[] }> {
    const integration = await this.findApiProviderIntegration(workspaceId, ['esemneaza'], true);

    const normalizedRules: EsemneazaTemplatePaymentAutomationRule[] = (Array.isArray(rules) ? rules : [])
      .map((row) => {
        const templateId = String(row?.templateId || '').trim();
        if (!templateId) {
          return null;
        }

        const rawAmount =
          row?.amount !== null && row?.amount !== undefined
            ? Number(row.amount)
            : undefined;
        const amount = Number.isFinite(rawAmount as number) && (rawAmount as number) > 0
          ? Number(rawAmount)
          : undefined;
        const currencyRaw = String(row?.currency || '').trim().toUpperCase();
        const descriptionRaw = String(row?.description || '').trim();
        const paymentLinkUrlRaw = this.getFirstNonEmpty(row?.paymentLinkUrl, row?.linkUrl, row?.url);
        const paymentLinkNameRaw = this.getFirstNonEmpty(row?.paymentLinkName, row?.linkName, row?.name);

        return {
          templateId,
          autoSendPaymentLink: row?.autoSendPaymentLink === true,
          ...(amount ? { amount } : {}),
          ...(currencyRaw ? { currency: currencyRaw } : {}),
          ...(descriptionRaw ? { description: descriptionRaw } : {}),
          ...(paymentLinkUrlRaw ? { paymentLinkUrl: paymentLinkUrlRaw } : {}),
          ...(paymentLinkNameRaw ? { paymentLinkName: paymentLinkNameRaw } : {}),
        };
      })
      .filter((row): row is EsemneazaTemplatePaymentAutomationRule => !!row);

    integration.config = {
      ...(integration.config || {}),
      templatePaymentAutomation: normalizedRules,
    };
    await this.integrationRepository.save(integration);

    return { rules: normalizedRules };
  }

  async getPayfunnelLinkOptions(workspaceId: string): Promise<{ links: PayfunnelLinkOption[] }> {
    const integration = await this.findApiProviderIntegration(workspaceId, ['payfunnels', 'payfunnel']);
    if (!integration) {
      return { links: [] };
    }

    const configuredLinks = this.extractConfiguredPayfunnelLinks(integration);
    let apiLinks: PayfunnelLinkOption[] = [];

    const apiBaseUrl = this.getPayfunnelApiBase(integration);
    const linkEndpointCandidates = this.getPayfunnelEndpointCandidates(integration, 'links');
    const hasAbsoluteLinkEndpoint = linkEndpointCandidates.some((entry) => /^https?:\/\//i.test(entry));
    if (apiBaseUrl || hasAbsoluteLinkEndpoint) {
      try {
        const rows = await this.fetchProviderRowsWithFallback(
          integration,
          apiBaseUrl,
          linkEndpointCandidates,
          ['links', 'paymentLinks', 'items', 'results', 'data'],
        );
        apiLinks = rows
          .map((row: any): PayfunnelLinkOption | null => {
            const url = this.getFirstNonEmpty(
              row?.url,
              row?.paymentUrl,
              row?.checkoutUrl,
              row?.link,
              row?.data?.url,
              row?.data?.paymentUrl,
              row?.data?.checkoutUrl,
            );
            if (!url) return null;

            return {
              id: this.getFirstNonEmpty(row?.id, row?.linkId, row?.uuid, row?.slug, url) as string,
              name: this.getFirstNonEmpty(row?.name, row?.title, row?.label, row?.slug, url) as string,
              url,
              source: 'payfunnel_api' as const,
            };
          })
          .filter((row): row is PayfunnelLinkOption => row !== null);
      } catch (error) {
        this.logger.warn(`Could not fetch PayFunnels link options: ${this.extractHttpErrorMessage(error)}`);
      }
    }

    const merged = new Map<string, PayfunnelLinkOption>();
    [...configuredLinks, ...apiLinks].forEach((link) => {
      const key = `${link.id}:${link.url}`.toLowerCase();
      if (!merged.has(key)) {
        merged.set(key, link);
      }
    });

    return { links: Array.from(merged.values()) };
  }

  async getPayfunnelDashboardData(workspaceId: string): Promise<PayfunnelDashboardResult> {
    const integration = await this.findApiProviderIntegration(workspaceId, ['payfunnels', 'payfunnel']);
    if (!integration) {
      return {
        connected: false,
        apiEnabled: false,
        message: 'PayFunnels integration is not connected.',
        payments: [],
        subscriptions: [],
        links: [],
      };
    }

    const localSnapshot = await this.getLocalPayfunnelDashboardSnapshot(workspaceId);
    const configuredLinks = this.extractConfiguredPayfunnelLinks(integration)
      .map((link) => ({
        id: link.id,
        name: link.name,
        url: link.url,
        source: link.source,
      }));

    const apiBaseUrl = this.getPayfunnelApiBase(integration);
    const paymentsEndpointCandidates = this.getPayfunnelEndpointCandidates(integration, 'payments');
    const subscriptionsEndpointCandidates = this.getPayfunnelEndpointCandidates(integration, 'subscriptions');
    const linksEndpointCandidates = this.getPayfunnelEndpointCandidates(integration, 'links');
    const hasAbsoluteImportEndpoint = [
      ...paymentsEndpointCandidates,
      ...subscriptionsEndpointCandidates,
      ...linksEndpointCandidates,
    ].some((value) => /^https?:\/\//i.test(String(value || '').trim()));

    if (!apiBaseUrl && !hasAbsoluteImportEndpoint) {
      const mergedLinksMap = new Map<string, PayfunnelDashboardLink>();
      [...configuredLinks, ...localSnapshot.links].forEach((link) => {
        const key = `${link.id}:${link.url}`.toLowerCase();
        if (!mergedLinksMap.has(key)) {
          mergedLinksMap.set(key, link);
        }
      });

      return {
        connected: true,
        apiEnabled: false,
        message: 'Webhook-only mode: afisez platile si linkurile locale din CRM. Pentru import complet, seteaza API URL sau path-uri absolute (https://...).',
        payments: localSnapshot.payments,
        subscriptions: [],
        links: Array.from(mergedLinksMap.values()),
      };
    }

    const rawLimit = Number(
      integration.config?.listLimit ||
      integration.config?.payfunnelListLimit ||
      integration.credentials?.listLimit ||
      200,
    );
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 500) : 200;
    const accountId = this.getFirstNonEmpty(
      integration.config?.accountId,
      integration.credentials?.accountId,
    );
    const baseQuery: Record<string, string | number | undefined> = {
      limit,
      accountId,
    };

    const errors: string[] = [];
    const [paymentsRows, subscriptionRows, linksRows] = await Promise.all([
      this.fetchProviderRowsWithFallback(
        integration,
        apiBaseUrl,
        paymentsEndpointCandidates,
        ['payments', 'transactions', 'orders', 'items', 'results', 'data'],
        baseQuery,
      ).catch((error) => {
        errors.push(`payments: ${this.extractHttpErrorMessage(error)}`);
        return [];
      }),
      this.fetchProviderRowsWithFallback(
        integration,
        apiBaseUrl,
        subscriptionsEndpointCandidates,
        ['subscriptions', 'memberships', 'items', 'results', 'data'],
        baseQuery,
      ).catch((error) => {
        errors.push(`subscriptions: ${this.extractHttpErrorMessage(error)}`);
        return [];
      }),
      this.fetchProviderRowsWithFallback(
        integration,
        apiBaseUrl,
        linksEndpointCandidates,
        ['links', 'paymentLinks', 'items', 'results', 'data'],
        baseQuery,
      ).catch((error) => {
        errors.push(`links: ${this.extractHttpErrorMessage(error)}`);
        return [];
      }),
    ]);

    const apiPayments = this.deduplicatePayfunnelPayments(paymentsRows
      .map((row: any) => this.parsePayfunnelPaymentRow(row))
      .filter((row): row is PayfunnelDashboardPayment => !!row));

    const subscriptions = this.deduplicatePayfunnelSubscriptions(subscriptionRows
      .map((row: any) => this.parsePayfunnelSubscriptionRow(row))
      .filter((row): row is PayfunnelDashboardSubscription => !!row));

    const apiLinks = this.deduplicatePayfunnelLinks(linksRows
      .map((row: any) => this.parsePayfunnelLinkRow(row, 'payfunnel_api'))
      .filter((row): row is PayfunnelDashboardLink => !!row));

    const enrichedApiPayments = this.deduplicatePayfunnelPayments(
      this.attachPayfunnelSubscriptionDataToPayments(apiPayments, subscriptions),
    );
    const mergedPayments = this.deduplicatePayfunnelPayments([
      ...localSnapshot.payments,
      ...enrichedApiPayments,
    ]);

    const mergedLinksMap = new Map<string, PayfunnelDashboardLink>();
    [...configuredLinks, ...localSnapshot.links, ...apiLinks].forEach((link) => {
      const key = `${link.id}:${link.url}`.toLowerCase();
      if (!mergedLinksMap.has(key)) {
        mergedLinksMap.set(key, link);
      }
    });

    try {
      await this.reconcilePayfunnelPaymentsWithDocuments(workspaceId, mergedPayments);
    } catch (error) {
      this.logger.warn(`PayFunnels reconciliation skipped: ${error.message}`);
    }

    return {
      connected: true,
      apiEnabled: true,
      ...(errors.length > 0 ? { errors } : {}),
      payments: mergedPayments,
      subscriptions,
      links: Array.from(mergedLinksMap.values()),
    };
  }

  private async reconcilePayfunnelPaymentsWithDocuments(
    workspaceId: string,
    payments: PayfunnelDashboardPayment[],
  ): Promise<void> {
    if (!Array.isArray(payments) || payments.length === 0) {
      return;
    }

    const candidates = payments.filter((payment) => payment.status === 'paid' || payment.status === 'failed');
    for (const payment of candidates) {
      const paymentReference = String(payment.paymentReference || '').trim();
      const externalPaymentId = String(payment.id || '').trim();
      const customerEmail = this.normalizeEmail(payment.customerEmail);
      if (!paymentReference && !externalPaymentId && !customerEmail) {
        continue;
      }

      let document = await this.findPayfunnelDocumentByPaymentIdentifiers(
        workspaceId,
        paymentReference,
        externalPaymentId,
        payment.paymentLinkId,
      );
      if (!document && customerEmail) {
        document = await this.findLatestPayfunnelDocumentByEmail(workspaceId, customerEmail);
      }

      if (!document) {
        continue;
      }
      if (this.isPaymentSuppressedForDocument(document)) {
        continue;
      }

      const paymentMetadata = { ...(document.metadata?.payment || {}) } as Record<string, any>;
      const currentStatus = this.normalizePaymentStatus(paymentMetadata.status);
      const subscriptionSnapshot = this.buildPaymentSubscriptionMetadata(payment);

      const metadataPatch: Record<string, any> = {
        ...(paymentReference ? { paymentReference } : {}),
        ...(externalPaymentId ? { externalPaymentId } : {}),
        ...(customerEmail ? { customerEmail } : {}),
        ...subscriptionSnapshot,
      };
      const hasMetadataChanges = this.hasPaymentMetadataPatchChanges(paymentMetadata, metadataPatch);

      if (currentStatus === payment.status && !hasMetadataChanges) {
        continue;
      }

      if (currentStatus === payment.status) {
        document.metadata = {
          ...document.metadata,
          payment: {
            ...paymentMetadata,
            ...metadataPatch,
            reconciledFrom: 'payfunnel_dashboard',
            reconciledAt: new Date(),
          },
        };
        document.addAuditEntry('payfunnels.metadata.reconciled', 'sync', {
          source: 'payfunnel.dashboard',
          paymentReference,
          externalPaymentId,
          customerEmail,
        });
        await this.documentRepository.save(document);
        continue;
      }

      if (payment.status === 'paid') {
        document.metadata = {
          ...document.metadata,
          payment: {
            ...paymentMetadata,
            ...metadataPatch,
            status: 'paid',
            paidAt: payment.paidAt ? new Date(payment.paidAt) : new Date(),
            reconciledFrom: 'payfunnel_dashboard',
            reconciledAt: new Date(),
          },
        };
        document.addAuditEntry('payfunnels.paid.reconciled', 'sync', {
          source: 'payfunnel.dashboard',
          paymentReference,
          externalPaymentId,
        });
        await this.documentRepository.save(document);
        await this.applyPaymentStatusSideEffects(document, 'paid');
        await this.notifyPaymentCompletedAudience(document, {
          title: 'Plata confirmata',
          message: `${payment.customerName || 'Clientul'} a platit pentru "${document.name}".`,
          link: '/payments',
        });
        continue;
      }

      const failureReason = payment.failureReason || 'Plata esuata';
      document.metadata = {
        ...document.metadata,
        payment: {
          ...paymentMetadata,
          ...metadataPatch,
          status: 'failed',
          failedAt: new Date(),
          failureReason,
          reconciledFrom: 'payfunnel_dashboard',
          reconciledAt: new Date(),
        },
      };
      document.addAuditEntry('payfunnels.failed.reconciled', 'sync', {
        source: 'payfunnel.dashboard',
        paymentReference,
        externalPaymentId,
        reason: failureReason,
      });
      await this.documentRepository.save(document);
      await this.applyPaymentStatusSideEffects(document, 'failed', failureReason);
      await this.notifyDocumentStakeholders(document, {
        title: 'Plata esuata',
        message: `${payment.customerName || 'Clientul'} nu a platit pentru "${document.name}"${failureReason ? `: ${failureReason}` : '.'}`,
        link: '/payments',
      });
    }
  }

  async uploadEsemneazaFile(
    workspaceId: string,
    file: Express.Multer.File,
  ): Promise<{ fileName: string; originalName: string; size: number; mimeType: string }> {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
      throw new BadRequestException('eSemneaza accepts files up to 15MB');
    }

    const allowedMimeTypes = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
    const lowerOriginal = String(file.originalname || '').toLowerCase();
    const allowedByExtension =
      lowerOriginal.endsWith('.pdf') ||
      lowerOriginal.endsWith('.doc') ||
      lowerOriginal.endsWith('.docx');

    if (!allowedMimeTypes.has(file.mimetype) && !allowedByExtension) {
      throw new BadRequestException('Only PDF, DOC or DOCX files are allowed');
    }

    const integration = await this.findApiProviderIntegration(workspaceId, ['esemneaza'], true);
    const apiUrl = this.resolveProviderBaseUrl(integration);
    if (!apiUrl) {
      throw new BadRequestException('eSemneaza API URL is missing in integration config');
    }

    const endpoint = integration.config?.uploadFilePath || '/api/v1/files';
    const form = new FormData();
    form.append('file', file.buffer, {
      filename: file.originalname || `contract-${Date.now()}.pdf`,
      contentType: file.mimetype || 'application/octet-stream',
    });

    const authHeaders = this.buildProviderHeaders(integration);
    delete authHeaders['Content-Type'];

    try {
      const response = await this.httpService.axiosRef.post(
        this.buildProviderUrl(apiUrl, endpoint),
        form,
        {
          headers: {
            ...authHeaders,
            ...form.getHeaders(),
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
        },
      );

      const uploadedFileName = this.getFirstNonEmpty(
        response.data?.fileName,
        response.data?.name,
        response.data?.data?.fileName,
      );

      if (!uploadedFileName) {
        throw new Error('Missing fileName in eSemneaza upload response');
      }

      return {
        fileName: uploadedFileName,
        originalName: file.originalname || uploadedFileName,
        size: file.size,
        mimeType: file.mimetype,
      };
    } catch (error) {
      this.logger.error(`eSemneaza upload failed: ${error.message}`);
      throw new BadRequestException(`eSemneaza upload failed: ${error.message}`);
    }
  }

  async syncEsemneazaDocuments(workspaceId: string, userId?: string): Promise<EsemneazaSyncResult> {
    const integration = await this.findApiProviderIntegration(workspaceId, ['esemneaza']);
    if (!integration) {
      return {
        imported: 0,
        updated: 0,
        skipped: 0,
        totalFetched: 0,
        message: 'eSemneaza integration is not connected',
      };
    }

    const apiUrl = this.resolveProviderBaseUrl(integration);
    if (!apiUrl) {
      return {
        imported: 0,
        updated: 0,
        skipped: 0,
        totalFetched: 0,
        message: 'eSemneaza API URL is not configured.',
      };
    }

    const rawListLimit = Number(integration.config?.listDocumentsLimit || integration.config?.syncMaxRows || 50);
    const listLimit = Number.isFinite(rawListLimit) && rawListLimit > 0 ? Math.min(rawListLimit, 100) : 50;

    let responseData: any;
    try {
      responseData = await this.fetchEsemneazaRequestsPayload(integration, apiUrl, {
        limit: listLimit,
      });
    } catch (error) {
      const message = this.extractHttpErrorMessage(error);
      this.logger.error(`Could not fetch eSemneaza documents from API: ${message}`);
      throw new BadRequestException(`eSemneaza documents sync failed: ${message}`);
    }

    const rows = this.extractApiRows(responseData, [
      'documents',
      'contracts',
      'items',
      'results',
      'data',
    ]).filter((row) => row && typeof row === 'object');

    const rawMaxRows = Number(integration.config?.syncMaxRows || 200);
    const maxRows = Number.isFinite(rawMaxRows) && rawMaxRows > 0 ? rawMaxRows : 200;
    const limitedRows = rows.slice(0, maxRows);

    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of limitedRows) {
      const externalId = this.getFirstNonEmpty(
        row?.id,
        row?.documentId,
        row?.contractId,
        row?.uuid,
        row?.externalId,
        row?.data?.id,
        row?.data?.documentId,
        row?.data?.contractId,
      );

      if (!externalId) {
        skipped += 1;
        continue;
      }

      let details: any = null;
      const shouldFetchDetails = integration.config?.fetchRequestDetails !== false;
      if (shouldFetchDetails) {
        const detailsPathTemplate = String(
          integration.config?.requestDetailsPath || '/api/v1/requests/{requestId}',
        );
        const detailsPath = detailsPathTemplate.includes('{requestId}')
          ? detailsPathTemplate.replace('{requestId}', encodeURIComponent(externalId))
          : `${detailsPathTemplate.replace(/\/+$/, '')}/${encodeURIComponent(externalId)}`;

        try {
          const detailsResponse = await this.httpService.axiosRef.get(
            this.buildProviderUrl(apiUrl, detailsPath),
            {
              headers: this.buildProviderHeaders(integration),
            },
          );
          details = detailsResponse.data || null;
        } catch (error) {
          this.logger.warn(`Could not fetch eSemneaza details for request ${externalId}: ${this.extractHttpErrorMessage(error)}`);
        }
      }

      const source = details || row;

      const statusRaw = String(
        source?.status ||
        source?.state ||
        source?.documentStatus ||
        source?.contractStatus ||
        row?.status ||
        row?.state ||
        source?.data?.status ||
        row?.data?.status ||
        '',
      ).trim();
      const mappedStatus = this.mapEsemneazaStatus(statusRaw);

      const recipients = this.extractEsemneazaRecipients(source);
      const primaryRecipientEmail = recipients[0]?.email;
      const contactId = await this.findContactIdByEmail(workspaceId, primaryRecipientEmail);

      const name =
        this.getFirstNonEmpty(
          source?.name,
          source?.docName,
          source?.title,
          source?.subject,
          source?.documentName,
          source?.contractName,
          source?.data?.name,
          source?.data?.title,
          row?.name,
          row?.docName,
          row?.title,
          row?.subject,
          row?.documentName,
          row?.contractName,
          row?.data?.name,
          row?.data?.title,
        ) || `Contract ${externalId}`;

      const remoteType = this.getFirstNonEmpty(
        source?.type,
        source?.documentType,
        source?.contractType,
        row?.type,
        row?.documentType,
        row?.contractType,
        source?.data?.type,
        row?.data?.type,
      );
      const documentType = this.mapDocumentType(remoteType);

      const signingUrl = this.getFirstNonEmpty(
        source?.signingUrl,
        source?.signUrl,
        source?.url,
        source?.signLink,
        source?.signing_link,
        source?.data?.signingUrl,
        source?.data?.signUrl,
        row?.signingUrl,
        row?.signUrl,
        row?.url,
        row?.signLink,
        row?.signing_link,
        row?.data?.signingUrl,
        row?.data?.signUrl,
      );
      const documentUrl = this.getFirstNonEmpty(
        source?.documentUrl,
        source?.fileUrl,
        source?.pdfUrl,
        source?.viewUrl,
        source?.data?.documentUrl,
        source?.data?.fileUrl,
        row?.documentUrl,
        row?.fileUrl,
        row?.pdfUrl,
        row?.viewUrl,
        row?.data?.documentUrl,
        row?.data?.fileUrl,
      );
      const downloadUrl = this.getFirstNonEmpty(
        source?.downloadUrl,
        source?.pdfDownloadUrl,
        source?.fileDownloadUrl,
        source?.data?.downloadUrl,
        row?.downloadUrl,
        row?.pdfDownloadUrl,
        row?.fileDownloadUrl,
        row?.data?.downloadUrl,
      );

      const templateId = this.getFirstNonEmpty(
        source?.templateId,
        source?.template?.id,
        source?.templateUuid,
        source?.data?.templateId,
        row?.templateId,
        row?.template?.id,
        row?.templateUuid,
        row?.data?.templateId,
      );
      const templateName = this.getFirstNonEmpty(
        source?.templateName,
        source?.template?.name,
        source?.templateTitle,
        source?.data?.templateName,
        row?.templateName,
        row?.template?.name,
        row?.templateTitle,
        row?.data?.templateName,
      );

      const sentAt = this.parseDateValue(
        source?.sentAt ||
        source?.sent_at ||
        source?.createdAt ||
        source?.created_at ||
        source?.data?.sentAt ||
        row?.sentAt ||
        row?.sent_at ||
        row?.createdAt ||
        row?.created_at ||
        row?.data?.sentAt,
      );
      const viewedAt = this.parseDateValue(
        source?.viewedAt ||
        source?.openedAt ||
        source?.lastViewedAt ||
        source?.data?.viewedAt ||
        row?.viewedAt ||
        row?.openedAt ||
        row?.lastViewedAt ||
        row?.data?.viewedAt,
      );
      const signedAt = this.parseDateValue(
        source?.signedAt ||
        source?.completedAt ||
        source?.completed_at ||
        source?.signDate ||
        source?.data?.signedAt ||
        row?.signedAt ||
        row?.completedAt ||
        row?.completed_at ||
        row?.signDate ||
        row?.data?.signedAt,
      );
      const expiresAt = this.parseDateValue(
        source?.expiresAt ||
        source?.expiredAt ||
        source?.expiryDate ||
        source?.data?.expiresAt ||
        row?.expiresAt ||
        row?.expiredAt ||
        row?.expiryDate ||
        row?.data?.expiresAt,
      );

      const existing = await this.documentRepository.findOne({
        where: {
          workspaceId,
          integrationId: integration.id,
          externalId,
        },
      });

      if (existing) {
        existing.name = name;
        existing.type = documentType;
        existing.status = mappedStatus;
        existing.signingUrl = signingUrl || existing.signingUrl;
        existing.documentUrl = documentUrl || existing.documentUrl;
        existing.downloadUrl = downloadUrl || existing.downloadUrl;
        existing.recipients = recipients.length > 0 ? recipients : existing.recipients;
        existing.template = {
          ...(existing.template || {}),
          ...(templateId ? { id: templateId } : {}),
          ...(templateName ? { name: templateName } : {}),
        };
        existing.sentAt = sentAt || existing.sentAt;
        existing.viewedAt = viewedAt || existing.viewedAt;
        existing.signedAt = signedAt || existing.signedAt;
        existing.expiresAt = expiresAt || existing.expiresAt;
        if (contactId) {
          existing.contactId = contactId;
        }
        existing.metadata = {
          ...(existing.metadata || {}),
          provider: 'esemneaza',
          source: 'esemneaza.sync',
          remoteStatus: statusRaw || mappedStatus,
          lastRemoteSyncAt: new Date().toISOString(),
          providerPayload: details || row,
        };
        existing.addAuditEntry('esemneaza.synced', userId || 'system', {
          status: mappedStatus,
        });

        await this.documentRepository.save(existing);
        updated += 1;
        continue;
      }

      const created = this.documentRepository.create({
        workspaceId,
        name,
        type: documentType,
        status: mappedStatus,
        provider: DocumentProvider.INTERNAL,
        externalId,
        documentUrl,
        signingUrl,
        downloadUrl,
        createdById: userId || integration.userId,
        contactId: contactId || undefined,
        integrationId: integration.id,
        template: {
          id: templateId,
          name: templateName,
        },
        recipients,
        metadata: {
          provider: 'esemneaza',
          source: 'esemneaza.sync',
          remoteStatus: statusRaw || mappedStatus,
          lastRemoteSyncAt: new Date().toISOString(),
          providerPayload: details || row,
        },
        sentAt,
        viewedAt,
        signedAt,
        expiresAt,
      });

      created.addAuditEntry('esemneaza.imported', userId || 'system', {
        status: mappedStatus,
      });

      await this.documentRepository.save(created);
      imported += 1;
    }

    return {
      imported,
      updated,
      skipped: skipped + Math.max(rows.length - limitedRows.length, 0),
      totalFetched: limitedRows.length,
      message: rows.length > maxRows ? `Imported first ${maxRows} records (syncMaxRows limit)` : undefined,
    };
  }

  async listEsemneazaRequests(
    workspaceId: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<EsemneazaRequestSummary[]> {
    const integration = await this.findApiProviderIntegration(workspaceId, ['esemneaza'], true);
    const apiUrl = this.resolveProviderBaseUrl(integration);
    if (!apiUrl) {
      throw new BadRequestException('eSemneaza API URL is not configured');
    }

    const rawLimit = Number(options?.limit);
    const limit = Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(Math.trunc(rawLimit), 100)
      : undefined;

    let payload: any;
    try {
      payload = await this.fetchEsemneazaRequestsPayload(integration, apiUrl, {
        cursor: options?.cursor,
        limit,
      });
    } catch (error) {
      throw new BadRequestException(`Could not list eSemneaza requests: ${this.extractHttpErrorMessage(error)}`);
    }

    const rows = this.extractApiRows(payload, [
      'documents',
      'contracts',
      'items',
      'results',
      'data',
    ]).filter((row) => row && typeof row === 'object');

    return rows
      .map((row: any) => ({
        id: String(
          row?.id ||
          row?.requestId ||
          row?.documentId ||
          row?.contractId ||
          row?.uuid ||
          '',
        ).trim(),
        createdAt: this.getFirstNonEmpty(
          row?.createdAt,
          row?.created_at,
          row?.sentAt,
          row?.sent_at,
        ),
        docName: this.getFirstNonEmpty(
          row?.docName,
          row?.name,
          row?.title,
          row?.documentName,
          row?.contractName,
        ),
        status: this.getFirstNonEmpty(row?.status, row?.state),
        completedAt: this.getFirstNonEmpty(row?.completedAt, row?.completed_at) || null,
      }))
      .filter((row) => !!row.id);
  }

  async getEsemneazaRequestDetails(workspaceId: string, requestId: string): Promise<any> {
    const normalizedRequestId = String(requestId || '').trim();
    if (!normalizedRequestId) {
      throw new BadRequestException('requestId is required');
    }

    const integration = await this.findApiProviderIntegration(workspaceId, ['esemneaza'], true);
    const apiUrl = this.resolveProviderBaseUrl(integration);
    if (!apiUrl) {
      throw new BadRequestException('eSemneaza API URL is not configured');
    }

    const detailsPathTemplate = String(
      integration.config?.requestDetailsPath || '/api/v1/requests/{requestId}',
    );
    const detailsPath = detailsPathTemplate.includes('{requestId}')
      ? detailsPathTemplate.replace('{requestId}', encodeURIComponent(normalizedRequestId))
      : `${detailsPathTemplate.replace(/\/+$/, '')}/${encodeURIComponent(normalizedRequestId)}`;

    try {
      const response = await this.httpService.axiosRef.get(
        this.buildProviderUrl(apiUrl, detailsPath),
        {
          headers: this.buildProviderHeaders(integration),
        },
      );
      return response.data || {};
    } catch (error) {
      throw new BadRequestException(`Could not fetch eSemneaza request details: ${this.extractHttpErrorMessage(error)}`);
    }
  }

  async cancelEsemneazaRequest(
    workspaceId: string,
    requestId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const normalizedRequestId = String(requestId || '').trim();
    if (!normalizedRequestId) {
      throw new BadRequestException('requestId is required');
    }

    const integration = await this.findApiProviderIntegration(workspaceId, ['esemneaza'], true);
    const apiUrl = this.resolveProviderBaseUrl(integration);
    if (!apiUrl) {
      throw new BadRequestException('eSemneaza API URL is not configured');
    }

    const cancelPathTemplate = String(
      integration.config?.cancelRequestPath || '/api/v1/requests/{requestId}/cancel',
    );
    const cancelPath = cancelPathTemplate.includes('{requestId}')
      ? cancelPathTemplate.replace('{requestId}', encodeURIComponent(normalizedRequestId))
      : `${cancelPathTemplate.replace(/\/+$/, '')}/${encodeURIComponent(normalizedRequestId)}/cancel`;

    let responseData: any;
    try {
      const response = await this.httpService.axiosRef.post(
        this.buildProviderUrl(apiUrl, cancelPath),
        {},
        {
          headers: this.buildProviderHeaders(integration),
        },
      );
      responseData = response.data || {};
    } catch (error) {
      throw new BadRequestException(`Could not cancel eSemneaza request: ${this.extractHttpErrorMessage(error)}`);
    }

    const localDocument = await this.documentRepository.findOne({
      where: {
        workspaceId,
        integrationId: integration.id,
        externalId: normalizedRequestId,
      },
    });

    if (localDocument) {
      localDocument.status = DocumentStatus.VOIDED;
      localDocument.voidedAt = new Date();
      localDocument.addAuditEntry('esemneaza.canceled', userId, {
        requestId: normalizedRequestId,
      });
      await this.documentRepository.save(localDocument);
    }

    return {
      success: responseData?.success !== false,
      message: this.getFirstNonEmpty(responseData?.message, 'Request canceled') as string,
    };
  }

  async getEsemneazaRequestTempDownloadUrl(
    workspaceId: string,
    requestId: string,
  ): Promise<{ requestId: string; docUrl: string }> {
    return this.getEsemneazaRequestDownloadUrl(
      workspaceId,
      requestId,
      '/api/v1/requests/{requestId}/temp_download_url',
      'Could not get temporary download URL',
    );
  }

  async getEsemneazaRequestCompletedDownloadUrl(
    workspaceId: string,
    requestId: string,
  ): Promise<{ requestId: string; docUrl: string }> {
    return this.getEsemneazaRequestDownloadUrl(
      workspaceId,
      requestId,
      '/api/v1/requests/{requestId}/completed_download_url',
      'Could not get completed download URL',
    );
  }

  async signEsemneazaRecipientOnBehalf(
    workspaceId: string,
    userId: string,
    payload: { token: string; signatureText: string },
  ): Promise<any> {
    const token = String(payload?.token || '').trim();
    const signatureText = String(payload?.signatureText || '').trim();
    if (!token) {
      throw new BadRequestException('token is required');
    }
    if (!signatureText) {
      throw new BadRequestException('signatureText is required');
    }

    const integration = await this.findApiProviderIntegration(workspaceId, ['esemneaza'], true);
    const apiUrl = this.resolveProviderBaseUrl(integration);
    if (!apiUrl) {
      throw new BadRequestException('eSemneaza API URL is not configured');
    }

    const signOnBehalfPath = String(
      integration.config?.signOnBehalfPath || '/api/v1/recipients/sign-on-behalf',
    );

    try {
      const response = await this.httpService.axiosRef.post(
        this.buildProviderUrl(apiUrl, signOnBehalfPath),
        { token, signatureText },
        {
          headers: this.buildProviderHeaders(integration),
        },
      );

      const responseData = response.data || {};
      const requestId = this.getFirstNonEmpty(responseData?.requestId);
      if (requestId) {
        const localDocument = await this.documentRepository.findOne({
          where: {
            workspaceId,
            integrationId: integration.id,
            externalId: requestId,
          },
        });
        if (localDocument) {
          localDocument.addAuditEntry('esemneaza.sign_on_behalf_requested', userId, {
            requestId,
            recipientId: responseData?.recipientId,
          });
          await this.documentRepository.save(localDocument);
        }
      }

      return responseData;
    } catch (error) {
      throw new BadRequestException(`Could not sign on behalf: ${this.extractHttpErrorMessage(error)}`);
    }
  }

  async createFromEsemneaza(
    workspaceId: string,
    userId: string,
    data: CreateEsemneazaDocumentInput,
  ): Promise<Document> {
    if (!data.templateId && !data.fileName) {
      throw new BadRequestException('templateId or fileName is required');
    }

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

    const templatePaymentRule = this.findEsemneazaTemplatePaymentRule(integration, data.templateId);
    const resolvedAutoSendPaymentLink =
      typeof data.autoSendPaymentLink === 'boolean'
        ? data.autoSendPaymentLink
        : (templatePaymentRule?.autoSendPaymentLink ?? true);
    const paymentAmount =
      data.paymentAmount ??
      templatePaymentRule?.amount ??
      ((typeof deal?.value === 'number' ? Number(deal.value) : Number(deal?.value || 0)) || 0);
    const paymentCurrency =
      data.paymentCurrency ||
      templatePaymentRule?.currency ||
      deal?.currency ||
      'EUR';
    const paymentDescription =
      data.paymentDescription ||
      templatePaymentRule?.description ||
      `Plata pentru contract ${data.name}`;
    const preferredPaymentLinkUrl =
      this.getFirstNonEmpty(
        data.paymentLinkUrl,
        templatePaymentRule?.paymentLinkUrl,
      );
    const preferredPaymentLinkName =
      this.getFirstNonEmpty(
        data.paymentLinkName,
        templatePaymentRule?.paymentLinkName,
      );
    const sendPaymentEmail = data.sendPaymentEmail !== false;
    const sendPaymentWhatsApp = data.sendPaymentWhatsApp !== false;

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
      template: data.templateId
        ? {
            id: data.templateId,
            name: data.templateName,
          }
        : undefined,
      recipients: [
        {
          email: data.recipient.email,
          name: data.recipient.name,
          ...(data.recipient.phone ? { phone: data.recipient.phone } : {}),
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
          autoSendOnSign: resolvedAutoSendPaymentLink,
          status: 'awaiting_signature',
          amount: paymentAmount,
          currency: paymentCurrency,
          description: paymentDescription,
          deliveryChannels: {
            email: sendPaymentEmail,
            whatsapp: sendPaymentWhatsApp,
          },
          ...(preferredPaymentLinkUrl ? { preferredLinkUrl: preferredPaymentLinkUrl } : {}),
          ...(preferredPaymentLinkName ? { preferredLinkName: preferredPaymentLinkName } : {}),
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
      sendWhatsApp?: boolean;
      paymentLinkUrl?: string;
      paymentLinkName?: string;
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

    const paymentReference = String(paymentData.paymentReference || randomUUID());
    const manualPaymentLinkUrl = this.getFirstNonEmpty(
      options?.paymentLinkUrl,
      paymentData.preferredLinkUrl,
    );
    const manualPaymentLinkName = this.getFirstNonEmpty(
      options?.paymentLinkName,
      paymentData.preferredLinkName,
    );

    const amountCandidate =
      options?.amount ??
      (Number(paymentData.amount || 0) || Number(document.deal?.value || 0));
    const amount = Number.isFinite(amountCandidate) && amountCandidate > 0
      ? Number(amountCandidate)
      : undefined;
    if (!manualPaymentLinkUrl && !amount) {
      throw new BadRequestException('Payment amount is required and must be greater than zero');
    }

    const currency =
      options?.currency ||
      String(paymentData.currency || document.deal?.currency || 'EUR').toUpperCase();
    const description =
      options?.description ||
      paymentData.description ||
      `Plata pentru contract ${document.name}`;
    const finalAmount =
      amount ||
      (Number(paymentData.amount || 0) > 0 ? Number(paymentData.amount) : undefined);

    const recipient = this.getPrimaryRecipient(document);
    if (!recipient?.email) {
      throw new BadRequestException('Document recipient email is required to send payment link');
    }

    let paymentLink: { url: string; externalPaymentId?: string; raw?: any };
    if (manualPaymentLinkUrl) {
      const isHttp = /^https?:\/\//i.test(manualPaymentLinkUrl);
      if (!isHttp) {
        throw new BadRequestException('Payment link URL must start with http:// or https://');
      }
      paymentLink = {
        url: manualPaymentLinkUrl,
        externalPaymentId: paymentData.externalPaymentId,
        raw: { mode: 'manual_link' },
      };
    } else {
      const payfunnelIntegration = await this.findApiProviderIntegration(
        workspaceId,
        ['payfunnels', 'payfunnel'],
        true,
      );
      paymentLink = await this.createPayfunnelPaymentLink(
        payfunnelIntegration,
        {
          amount: amount as number,
          currency,
          description,
          customerEmail: recipient.email,
          customerName: recipient.name || document.contact?.fullName,
          metadata: {
            workspaceId,
            documentId: document.id,
            dealId: document.dealId,
            paymentReference,
            createdById: userId,
            customerEmail: recipient.email,
          },
        },
      );
    }

    document.metadata = {
      ...document.metadata,
      payment: {
        ...paymentData,
        provider: 'payfunnels',
        status: 'pending',
        ...(finalAmount ? { amount: finalAmount } : {}),
        currency,
        description,
        paymentLink: paymentLink.url,
        ...(manualPaymentLinkName ? { preferredLinkName: manualPaymentLinkName } : {}),
        ...(manualPaymentLinkUrl ? { preferredLinkUrl: manualPaymentLinkUrl } : {}),
        paymentReference,
        externalPaymentId: paymentLink.externalPaymentId,
        updatedAt: new Date(),
      },
    };
    document.addAuditEntry(manualPaymentLinkUrl ? 'payfunnels.link_selected' : 'payfunnels.link_created', userId, {
      amount: finalAmount,
      currency,
      paymentReference,
      externalPaymentId: paymentLink.externalPaymentId,
      paymentLinkUrl: paymentLink.url,
    });

    const saved = await this.documentRepository.save(document);

    const shouldSendEmail = options?.sendEmail !== false;
    const shouldSendWhatsApp = options?.sendWhatsApp === true;
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

    if (shouldSendWhatsApp && paymentLink.url) {
      const phoneTarget = this.getFirstNonEmpty(recipient.phone, document.contact?.phone);
      if (!phoneTarget) {
        if (!shouldSendEmail) {
          throw new BadRequestException('Recipient phone is required to send payment link via WhatsApp');
        }
        this.logger.warn(`Payment link WhatsApp skipped for ${document.id}: recipient phone is missing`);
      } else {
        try {
          await this.whatsAppService.sendMessageForWorkspace(workspaceId, {
            to: phoneTarget,
            type: 'text',
            content: `Contractul "${saved.name}" a fost semnat. Link plata: ${paymentLink.url}`,
          });
        } catch (error) {
          if (!shouldSendEmail) {
            throw new BadRequestException(`WhatsApp send failed: ${error.message}`);
          }
          this.logger.warn(`Payment link WhatsApp failed for ${document.id}: ${error.message}`);
          await this.notifyDocumentStakeholders(saved, {
            title: 'WhatsApp netrimis',
            message: `Linkul de plata a fost generat, dar mesajul WhatsApp nu a fost trimis: ${error.message}`,
          });
        }
      }
    }

    const anyChannelSent = shouldSendEmail || shouldSendWhatsApp;

    await this.notifyDocumentStakeholders(saved, {
      title: anyChannelSent ? 'Link de plata trimis' : 'Link de plata generat',
      message: anyChannelSent
        ? `A fost generat si trimis linkul de plata pentru documentul "${saved.name}".`
        : `A fost generat linkul de plata pentru documentul "${saved.name}".`,
    });

    return saved;
  }

  async remindEsemneazaRecipient(
    workspaceId: string,
    documentId: string,
    userId: string,
    email: string,
  ): Promise<{ success: boolean; message: string; recipientId?: string }> {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      throw new BadRequestException('Valid recipient email is required');
    }

    const context = await this.getEsemneazaDocumentContext(workspaceId, documentId);
    const detailsPathTemplate = String(
      context.integration.config?.requestDetailsPath || '/api/v1/requests/{requestId}',
    );
    const detailsPath = detailsPathTemplate.includes('{requestId}')
      ? detailsPathTemplate.replace('{requestId}', encodeURIComponent(context.requestId))
      : `${detailsPathTemplate.replace(/\/+$/, '')}/${encodeURIComponent(context.requestId)}`;

    let requestDetails: any;
    try {
      const detailsResponse = await this.httpService.axiosRef.get(
        this.buildProviderUrl(context.apiUrl, detailsPath),
        {
          headers: this.buildProviderHeaders(context.integration),
        },
      );
      requestDetails = detailsResponse.data || {};
    } catch (error) {
      throw new BadRequestException(`Could not fetch sign request details: ${this.extractHttpErrorMessage(error)}`);
    }

    const recipients = Array.isArray(requestDetails?.recipients) ? requestDetails.recipients : [];
    const recipient = recipients.find(
      (entry: any) => String(entry?.email || '').trim().toLowerCase() === normalizedEmail,
    );
    if (!recipient?.id) {
      throw new BadRequestException('Recipient email not found in sign request');
    }

    const recipientId = String(recipient.id).trim();
    const remindPathTemplate = String(
      context.integration.config?.remindRecipientPath || '/api/v1/recipients/{recipientId}/remind',
    );
    const remindPath = remindPathTemplate.includes('{recipientId}')
      ? remindPathTemplate.replace('{recipientId}', encodeURIComponent(recipientId))
      : `${remindPathTemplate.replace(/\/+$/, '')}/${encodeURIComponent(recipientId)}/remind`;

    try {
      await this.httpService.axiosRef.post(
        this.buildProviderUrl(context.apiUrl, remindPath),
        {},
        {
          headers: this.buildProviderHeaders(context.integration),
        },
      );
    } catch (error) {
      throw new BadRequestException(`Could not send reminder: ${this.extractHttpErrorMessage(error)}`);
    }

    context.document.addAuditEntry('esemneaza.reminder_sent', userId, {
      recipientId,
      email: normalizedEmail,
    });
    await this.documentRepository.save(context.document);

    await this.notifyDocumentStakeholders(context.document, {
      title: 'Reminder trimis',
      message: `A fost trimis reminder pentru ${normalizedEmail} la documentul "${context.document.name}".`,
    });

    return { success: true, message: 'Reminder sent', recipientId };
  }

  async signEsemneazaRequest(
    workspaceId: string,
    documentId: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const context = await this.getEsemneazaDocumentContext(workspaceId, documentId);
    const signPathTemplate = String(
      context.integration.config?.signRequestPath || '/api/v1/requests/{requestId}/sign',
    );
    const signPath = signPathTemplate.includes('{requestId}')
      ? signPathTemplate.replace('{requestId}', encodeURIComponent(context.requestId))
      : `${signPathTemplate.replace(/\/+$/, '')}/${encodeURIComponent(context.requestId)}/sign`;

    try {
      await this.httpService.axiosRef.post(
        this.buildProviderUrl(context.apiUrl, signPath),
        {},
        {
          headers: this.buildProviderHeaders(context.integration),
        },
      );
    } catch (error) {
      throw new BadRequestException(`Could not sign request: ${this.extractHttpErrorMessage(error)}`);
    }

    context.document.addAuditEntry('esemneaza.sign_requested', userId, {
      requestId: context.requestId,
    });
    await this.documentRepository.save(context.document);

    await this.notifyDocumentStakeholders(context.document, {
      title: 'Semnare initiata',
      message: `Semnarea a fost initiata pentru documentul "${context.document.name}".`,
    });

    return {
      success: true,
      message: 'Sign request accepted. Status will update asynchronously via webhook.',
    };
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
        payload?.requestId ||
        payload?.documentId ||
        payload?.contractId ||
        payload?.id ||
        payload?.data?.requestId ||
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
      String(
        payload?.event ||
        payload?.eventType ||
        payload?.eventName ||
        payload?.type ||
        payload?.status ||
        payload?.name ||
        payload?.data?.event ||
        payload?.data?.eventType ||
        payload?.data?.eventName ||
        payload?.data?.status ||
        '',
      )
        .toLowerCase()
        .trim();

    if (this.isSignedEvent(event)) {
      const existingPaymentMetadata = {
        ...((document.metadata?.payment as Record<string, any>) || {}),
      };
      const documentAlreadySigned = [DocumentStatus.SIGNED, DocumentStatus.COMPLETED].includes(document.status);
      const postSignatureSequenceSent = !!existingPaymentMetadata.postSignatureSequenceSentAt;
      if (documentAlreadySigned && postSignatureSequenceSent) {
        document.addAuditEntry('esemneaza.signed_duplicate', 'webhook', { event });
        await this.documentRepository.save(document);
        return {
          success: true,
          message: 'Duplicate signed webhook ignored',
          documentId: document.id,
        };
      }

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
      const signedPaymentMetadata = { ...existingPaymentMetadata };
      const paymentStatusBeforeSign = String(signedPaymentMetadata.status || '').trim().toLowerCase();
      if (
        !paymentStatusBeforeSign ||
        [
          'awaiting_signature',
          'signature_pending',
          'pending_signature',
          'sent',
        ].includes(paymentStatusBeforeSign)
      ) {
        signedPaymentMetadata.status = 'awaiting_payment';
      }
      if (!signedPaymentMetadata.awaitingPaymentSince) {
        signedPaymentMetadata.awaitingPaymentSince = new Date().toISOString();
      }
      document.metadata = {
        ...document.metadata,
        provider: 'esemneaza',
        providerEvent: event,
        payment: signedPaymentMetadata,
      };
      document.addAuditEntry('esemneaza.signed', 'webhook', { event });
      const savedDocument = await this.documentRepository.save(document);

      await this.notifyDocumentStakeholders(savedDocument, {
        title: 'Contract semnat',
        message: `Documentul "${savedDocument.name}" a fost semnat.`,
      });

      const currentPaymentMetadata = {
        ...((savedDocument.metadata?.payment as Record<string, any>) || {}),
      };
      const hasExplicitAutoSendFlag = typeof currentPaymentMetadata.autoSendOnSign === 'boolean';
      if (!hasExplicitAutoSendFlag) {
        const templatePaymentRule = this.findEsemneazaTemplatePaymentRule(
          integration,
          savedDocument.template?.id,
        );
        if (templatePaymentRule) {
          savedDocument.metadata = {
            ...savedDocument.metadata,
            payment: {
              ...currentPaymentMetadata,
              autoSendOnSign: templatePaymentRule.autoSendPaymentLink,
              amount: currentPaymentMetadata.amount ?? templatePaymentRule.amount,
              currency: currentPaymentMetadata.currency || templatePaymentRule.currency,
              description: currentPaymentMetadata.description || templatePaymentRule.description,
              preferredLinkUrl: currentPaymentMetadata.preferredLinkUrl || templatePaymentRule.paymentLinkUrl,
              preferredLinkName: currentPaymentMetadata.preferredLinkName || templatePaymentRule.paymentLinkName,
            },
          };
          await this.documentRepository.save(savedDocument);
        }
      }

      const effectivePaymentMetadata = {
        ...((savedDocument.metadata?.payment as Record<string, any>) || {}),
      };
      const autoSendPayment = effectivePaymentMetadata.autoSendOnSign === true;
      const paymentDeliveryChannels = {
        email: effectivePaymentMetadata.deliveryChannels?.email !== false,
        whatsapp: effectivePaymentMetadata.deliveryChannels?.whatsapp !== false,
      };
      let paymentLink: string | undefined = this.getFirstNonEmpty(effectivePaymentMetadata.paymentLink);
      if (autoSendPayment) {
        try {
          if (!paymentLink) {
            const paymentDocument = await this.generatePaymentLinkForDocument(
              integration.workspaceId,
              savedDocument.id,
              savedDocument.createdById || 'system',
              { sendEmail: false, sendWhatsApp: false },
            );
            paymentLink = paymentDocument.metadata?.payment?.paymentLink;
          }
        } catch (error) {
          this.logger.error(`Auto payment link generation failed: ${error.message}`);
          await this.notifyDocumentStakeholders(savedDocument, {
            title: 'Eroare generare link plata',
            message: `Contractul este semnat, dar linkul de plata nu a putut fi generat: ${error.message}`,
          });
        }
      }

      const sequenceSent = await this.sendPostSignatureSequence({
        workspaceId: integration.workspaceId,
        document: savedDocument,
        email: signerEmailFromPayload || this.getPrimaryRecipient(savedDocument).email,
        phone: resolvedContact?.phone || signerPhoneFromPayload,
        contactName: resolvedContact?.fullName || this.getPrimaryRecipient(savedDocument).name,
        paymentLink,
        sendEmail: paymentDeliveryChannels.email,
        sendWhatsApp: paymentDeliveryChannels.whatsapp,
      });

      if (sequenceSent) {
        savedDocument.metadata = {
          ...savedDocument.metadata,
          payment: {
            ...((savedDocument.metadata?.payment as Record<string, any>) || {}),
            postSignatureSequenceSentAt: new Date(),
            postSignatureSequenceEvent: event,
          },
        };
        await this.documentRepository.save(savedDocument);
      }

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
    this.verifyWebhookSecret(integration, headers, [
      'x-payfunnel-token',
      'x-payfunnels-token',
      'x-pf-token',
      'x-pf-webhook-token',
      'x-webhook-token',
      'x-pf-signature',
      'x-payfunnel-signature',
      'x-payfunnels-signature',
    ]);

    const scopes = this.collectPayfunnelWebhookScopes(payload);
    const metadataScopes = this.extractPayfunnelWebhookMetadataScopes(scopes);
    const scopeValues = (picker: (scope: Record<string, any>) => any): any[] => scopes.map(picker);

    const eventName = String(
      this.getFirstNonEmpty(
        ...scopeValues((scope) => scope?.event),
        ...scopeValues((scope) => scope?.type),
        ...scopeValues((scope) => scope?.eventName),
        ...scopeValues((scope) => scope?.eventType),
        ...scopeValues((scope) => scope?.name),
        ...scopeValues((scope) => scope?.action),
        ...scopeValues((scope) => scope?.kind),
      ) || '',
    ).toLowerCase();
    const statusRaw = String(
      this.getFirstNonEmpty(
        ...scopeValues((scope) => scope?.status),
        ...scopeValues((scope) => scope?.paymentStatus),
        ...scopeValues((scope) => scope?.transactionStatus),
        ...scopeValues((scope) => scope?.orderStatus),
        ...scopeValues((scope) => scope?.payment_state),
        ...scopeValues((scope) => scope?.state),
        ...scopeValues((scope) => scope?.result),
        ...scopeValues((scope) => scope?.payment?.status),
        ...scopeValues((scope) => scope?.transaction?.status),
        ...scopeValues((scope) => scope?.order?.status),
        eventName,
      ) || '',
    ).toLowerCase();

    const documentId = String(
      this.getFirstNonEmpty(
        ...metadataScopes.map((scope) => scope?.documentId),
        ...metadataScopes.map((scope) => scope?.crmDocumentId),
        ...scopeValues((scope) => scope?.documentId),
        ...scopeValues((scope) => scope?.crmDocumentId),
      ) || '',
    ).trim();
    const paymentReference = String(
      this.getFirstNonEmpty(
        ...metadataScopes.map((scope) => scope?.paymentReference),
        ...metadataScopes.map((scope) => scope?.reference),
        ...metadataScopes.map((scope) => scope?.transactionReference),
        ...metadataScopes.map((scope) => scope?.orderReference),
        ...scopeValues((scope) => scope?.paymentReference),
        ...scopeValues((scope) => scope?.reference),
        ...scopeValues((scope) => scope?.transactionReference),
        ...scopeValues((scope) => scope?.orderReference),
        ...scopeValues((scope) => scope?.invoiceNumber),
        ...scopeValues((scope) => scope?.payment?.reference),
        ...scopeValues((scope) => scope?.transaction?.reference),
      ) || '',
    ).trim();
    const externalPaymentId = String(
      this.getFirstNonEmpty(
        ...metadataScopes.map((scope) => scope?.externalPaymentId),
        ...metadataScopes.map((scope) => scope?.paymentId),
        ...metadataScopes.map((scope) => scope?.transactionId),
        ...scopeValues((scope) => scope?.paymentId),
        ...scopeValues((scope) => scope?.transactionId),
        ...scopeValues((scope) => scope?.chargeId),
        ...scopeValues((scope) => scope?.id),
        ...scopeValues((scope) => scope?.payment?.id),
        ...scopeValues((scope) => scope?.transaction?.id),
        ...scopeValues((scope) => scope?.order?.id),
      ) || '',
    ).trim();
    const paymentLinkId = String(
      this.getFirstNonEmpty(
        ...metadataScopes.map((scope) => scope?.paymentLinkId),
        ...metadataScopes.map((scope) => scope?.linkId),
        ...scopeValues((scope) => scope?.paymentLinkId),
        ...scopeValues((scope) => scope?.linkId),
        ...scopeValues((scope) => scope?.paymentLink?.id),
        ...scopeValues((scope) => scope?.paymentLink?.linkId),
      ) || '',
    ).trim();
    const customerEmail = this.extractPaymentCustomerEmail(payload);

    let document: Document | null = null;
    if (documentId) {
      document = await this.documentRepository.findOne({
        where: { id: documentId, workspaceId: integration.workspaceId },
        relations: ['deal', 'contact'],
      });
    }

    if (!document) {
      document = await this.findPayfunnelDocumentByPaymentIdentifiers(
        integration.workspaceId,
        paymentReference,
        externalPaymentId,
        paymentLinkId,
      );
    }

    if (!document && customerEmail) {
      document = await this.findLatestPayfunnelDocumentByEmail(integration.workspaceId, customerEmail);
    }

    if (document && this.isPaymentSuppressedForDocument(document)) {
      this.logger.log(
        `PayFunnels webhook ignored for payment-suppressed document ${document.id} (workspace=${integration.workspaceId})`,
      );
      return { success: true, message: 'Document payment sync suppressed', documentId: document.id };
    }

    if (!document) {
      if (this.isPaymentSuccess(statusRaw, eventName) || this.isPaymentFailure(statusRaw, eventName)) {
        const payerName = this.getFirstNonEmpty(
          ...scopeValues((scope) => scope?.customerName),
          ...scopeValues((scope) => scope?.customer?.name),
          ...scopeValues((scope) => scope?.customer?.fullName),
          ...scopeValues((scope) => scope?.payerName),
          ...scopeValues((scope) => scope?.customerEmail),
          ...scopeValues((scope) => scope?.customer?.email),
        ) || 'Clientul';

        const inferredFailureReason = String(
          this.getFirstNonEmpty(
            ...scopeValues((scope) => scope?.failureReason),
            ...scopeValues((scope) => scope?.declineReason),
            ...scopeValues((scope) => scope?.reason),
            ...scopeValues((scope) => scope?.errorMessage),
            ...scopeValues((scope) => scope?.message),
          ) || '',
        ).trim();

        const isPaidWithoutDocument = this.isPaymentSuccess(statusRaw, eventName);
        const inferredUserId = this.getFirstNonEmpty(
          ...scopeValues((scope) => scope?.createdById),
          ...metadataScopes.map((scope) => scope?.createdById),
        );
        await this.notifyWorkspacePaymentTransaction(integration.workspaceId, {
          title: isPaidWithoutDocument ? 'Plata primita (fara contract asociat)' : 'Plata esuata (fara contract asociat)',
          message: isPaidWithoutDocument
            ? `${payerName} a platit in PayFunnels, dar tranzactia nu este legata de un contract in CRM.`
            : `${payerName} a avut o plata esuata in PayFunnels${inferredFailureReason ? `: ${inferredFailureReason}` : '.'}`,
          userId: inferredUserId ? String(inferredUserId) : undefined,
          notifyLeadership: isPaidWithoutDocument,
          metadata: {
            source: 'payfunnel.webhook',
            status: isPaidWithoutDocument ? 'paid' : 'failed',
            paymentReference,
            externalPaymentId,
            paymentLinkId,
            customerEmail,
            payload,
          },
        });
        this.logger.warn(
          `PayFunnels webhook payment without matching document (workspace=${integration.workspaceId}, status=${statusRaw || eventName || 'unknown'}, reference=${paymentReference || '-'}, paymentId=${externalPaymentId || '-'}, linkId=${paymentLinkId || '-'}, email=${customerEmail || '-'})`,
        );
      }
      return { success: true, message: 'Document not found for payment webhook' };
    }

    const paymentMetadata = { ...(document.metadata?.payment || {}) } as Record<string, any>;
    const normalizedFailureReason = String(
      this.getFirstNonEmpty(
        ...scopeValues((scope) => scope?.failureReason),
        ...scopeValues((scope) => scope?.declineReason),
        ...scopeValues((scope) => scope?.reason),
        ...scopeValues((scope) => scope?.errorMessage),
        ...scopeValues((scope) => scope?.message),
      ) || '',
    ).trim();
    const payerName = this.resolvePaymentPayerName(document, payload);
    const subscriptionSnapshot = this.extractWebhookSubscriptionMetadata(payload);
    const parsedAmount = this.parseNumberValue(
      ...scopeValues((scope) => scope?.amount),
      ...scopeValues((scope) => scope?.totalAmountPaid),
      ...scopeValues((scope) => scope?.chargedAmount),
      ...scopeValues((scope) => scope?.chargeAmount),
      paymentMetadata.amount,
    );
    const parsedCurrency = this.getFirstNonEmpty(
      ...scopeValues((scope) => scope?.currency),
      ...scopeValues((scope) => scope?.currencyCode),
      ...scopeValues((scope) => scope?.amount?.currency),
      paymentMetadata.currency,
    );

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
          customerEmail: customerEmail || paymentMetadata.customerEmail,
          paymentLinkId: paymentLinkId || paymentMetadata.paymentLinkId,
          ...(parsedAmount !== undefined ? { amount: parsedAmount } : {}),
          ...(parsedCurrency ? { currency: String(parsedCurrency).toUpperCase() } : {}),
          ...subscriptionSnapshot,
          rawPayload: payload,
        },
      };
      document.addAuditEntry('payfunnels.paid', 'webhook', {
        externalPaymentId,
        paymentReference,
      });
      await this.documentRepository.save(document);
      try {
        await this.applyPaymentStatusSideEffects(document, 'paid');
      } catch (error) {
        this.logger.error(`Payment side effects failed for document ${document.id}: ${error.message}`);
      }

      this.eventEmitter.emit('payment.received', {
        workspaceId: integration.workspaceId,
        documentId: document.id,
        dealId: document.dealId,
        amount: Number(parsedAmount || 0),
        currency: parsedCurrency,
        status: 'paid',
      });

      await this.notifyPaymentCompletedAudience(document, {
        title: 'Plata confirmata',
        message: `${payerName} a platit pentru "${document.name}".`,
        link: '/payments',
      });

      return { success: true, message: 'Payment marked as paid', documentId: document.id };
    }

    const inferredFailureReason =
      normalizedFailureReason ||
      (statusRaw.includes('insufficient') || eventName.includes('insufficient')
        ? 'Fonduri insuficiente'
        : 'Plata esuata');

    if (isFailed) {
      document.metadata = {
        ...document.metadata,
        payment: {
          ...paymentMetadata,
          status: 'failed',
          failedAt: new Date(),
          failureReason: inferredFailureReason,
          externalPaymentId: externalPaymentId || paymentMetadata.externalPaymentId,
          paymentReference: paymentReference || paymentMetadata.paymentReference,
          customerEmail: customerEmail || paymentMetadata.customerEmail,
          paymentLinkId: paymentLinkId || paymentMetadata.paymentLinkId,
          ...(parsedAmount !== undefined ? { amount: parsedAmount } : {}),
          ...(parsedCurrency ? { currency: String(parsedCurrency).toUpperCase() } : {}),
          ...subscriptionSnapshot,
          rawPayload: payload,
        },
      };
      document.addAuditEntry('payfunnels.failed', 'webhook', {
        externalPaymentId,
        paymentReference,
        reason: normalizedFailureReason,
      });
      await this.documentRepository.save(document);
      try {
        await this.applyPaymentStatusSideEffects(document, 'failed', inferredFailureReason);
      } catch (error) {
        this.logger.error(`Payment side effects failed for document ${document.id}: ${error.message}`);
      }

      this.eventEmitter.emit('payment.received', {
        workspaceId: integration.workspaceId,
        documentId: document.id,
        dealId: document.dealId,
        amount: Number(parsedAmount || 0),
        currency: parsedCurrency,
        status: 'failed',
        failureReason: inferredFailureReason,
      });

      await this.notifyDocumentStakeholders(document, {
        title: 'Plata esuata',
        message: `${payerName} nu a platit pentru "${document.name}"${inferredFailureReason ? `: ${inferredFailureReason}` : '.'}`,
        link: '/payments',
      });

      return { success: true, message: 'Payment marked as failed', documentId: document.id };
    }

    this.logger.log(
      `PayFunnels webhook ignored (workspace=${integration.workspaceId}, document=${document.id}, event=${eventName || '-'}, status=${statusRaw || '-'})`,
    );
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

  async deletePaymentTransaction(
    workspaceId: string,
    userId: string,
    documentId: string,
    options?: { deleteDocument?: boolean },
  ): Promise<{ success: boolean; deletedDocument: boolean; documentId: string; message: string }> {
    const document = await this.findOne(workspaceId, documentId);
    const shouldDeleteDocument = options?.deleteDocument === true;

    if (shouldDeleteDocument) {
      await this.documentRepository.remove(document);
      return {
        success: true,
        deletedDocument: true,
        documentId,
        message: 'Contractul si tranzactia au fost sterse.',
      };
    }

    const currentMetadata = { ...(document.metadata || {}) } as Record<string, any>;
    const paymentMetadata = { ...((currentMetadata.payment as Record<string, any>) || {}) };
    if (!currentMetadata.payment && !this.isPaymentSuppressedForDocument(document)) {
      throw new BadRequestException('Documentul nu are o tranzactie activa in payments.');
    }

    delete currentMetadata.payment;
    currentMetadata.paymentSuppressed = true;
    currentMetadata.paymentSuppressedAt = new Date().toISOString();
    currentMetadata.paymentSuppressedBy = userId;
    currentMetadata.paymentSuppressedSnapshot = {
      ...paymentMetadata,
    };

    document.metadata = currentMetadata;
    document.addAuditEntry('payfunnels.transaction.removed', userId, {
      suppressed: true,
      paymentReference: paymentMetadata?.paymentReference,
      externalPaymentId: paymentMetadata?.externalPaymentId,
      reason: 'manual_from_payments',
    });
    await this.documentRepository.save(document);

    return {
      success: true,
      deletedDocument: false,
      documentId,
      message: 'Tranzactia a fost scoasa din payments.',
    };
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
      .orderBy('integration.updatedAt', 'DESC')
      .limit(25);

    const candidates = await qb.getMany();
    if (candidates.length === 0 && throwIfMissing) {
      throw new BadRequestException(
        `Integration ${providerKeys[0]} is not connected. Configure it in Integrations first.`,
      );
    }
    if (candidates.length === 0) {
      return null;
    }

    const sorted = [...candidates].sort((a, b) => {
      const score = (integration: Integration): number => {
        const provider = String(integration.config?.provider || integration.externalId || '').toLowerCase();
        const hasApiBase =
          provider === 'payfunnels' || provider === 'payfunnel'
            ? !!this.getPayfunnelApiBase(integration)
            : !!this.resolveProviderBaseUrl(integration);
        let value = 0;
        if (String(integration.status || '').toLowerCase() === 'active') {
          value += 4;
        }
        if (hasApiBase) {
          value += 3;
        }
        if (integration.credentials?.apiKey) {
          value += 1;
        }
        return value;
      };

      const scoreDiff = score(b) - score(a);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      const aTime = new Date((a as any).updatedAt || (a as any).createdAt || 0).getTime();
      const bTime = new Date((b as any).updatedAt || (b as any).createdAt || 0).getTime();
      return bTime - aTime;
    });

    return sorted[0] || null;
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

  private extractEsemneazaTemplatePaymentRules(
    integration: Integration,
  ): EsemneazaTemplatePaymentAutomationRule[] {
    const rows = this.normalizeListInput(
      integration.config?.templatePaymentAutomation ||
      integration.config?.templateAutomationRules,
    );

    return rows
      .map((row: any) => {
        const templateId = String(row?.templateId || row?.id || '').trim();
        if (!templateId) {
          return null;
        }

        const rawAmount =
          row?.amount !== null && row?.amount !== undefined
            ? Number(row.amount)
            : undefined;
        const amount = Number.isFinite(rawAmount as number) && (rawAmount as number) > 0
          ? Number(rawAmount)
          : undefined;
        const currency = String(row?.currency || '').trim().toUpperCase();
        const description = String(row?.description || '').trim();
        const paymentLinkUrl = this.getFirstNonEmpty(row?.paymentLinkUrl, row?.linkUrl, row?.url);
        const paymentLinkName = this.getFirstNonEmpty(row?.paymentLinkName, row?.linkName, row?.name);

        return {
          templateId,
          autoSendPaymentLink: row?.autoSendPaymentLink === true,
          ...(amount ? { amount } : {}),
          ...(currency ? { currency } : {}),
          ...(description ? { description } : {}),
          ...(paymentLinkUrl ? { paymentLinkUrl } : {}),
          ...(paymentLinkName ? { paymentLinkName } : {}),
        } as EsemneazaTemplatePaymentAutomationRule;
      })
      .filter((row): row is EsemneazaTemplatePaymentAutomationRule => !!row);
  }

  private extractConfiguredPayfunnelLinks(integration: Integration): PayfunnelLinkOption[] {
    const rows = this.normalizeListInput(
      integration.config?.paymentLinks ||
      integration.config?.predefinedPaymentLinks ||
      integration.config?.links,
    );

    return rows
      .map((row: any): PayfunnelLinkOption | null => {
        const url = this.getFirstNonEmpty(
          row?.url,
          row?.paymentUrl,
          row?.checkoutUrl,
          row?.link,
        );
        if (!url) return null;

        const id = this.getFirstNonEmpty(row?.id, row?.linkId, row?.slug, url) as string;
        const name = this.getFirstNonEmpty(row?.name, row?.title, row?.label, id) as string;
        return {
          id,
          name,
          url,
          source: 'integration_config' as const,
        };
      })
      .filter((row): row is PayfunnelLinkOption => row !== null);
  }

  private findEsemneazaTemplatePaymentRule(
    integration: Integration,
    templateId?: string,
  ): EsemneazaTemplatePaymentAutomationRule | undefined {
    const normalizedTemplateId = String(templateId || '').trim();
    if (!normalizedTemplateId) {
      return undefined;
    }

    return this.extractEsemneazaTemplatePaymentRules(integration).find(
      (rule) => rule.templateId === normalizedTemplateId,
    );
  }

  private async createEsemneazaSigningRequest(
    integration: Integration,
    data: CreateEsemneazaDocumentInput,
    workspaceId: string,
    userId: string,
  ): Promise<{ externalId: string; signingUrl?: string; documentUrl?: string; raw?: any }> {
    if (!data.templateId && !data.fileName) {
      throw new BadRequestException('templateId or fileName is required');
    }

    const apiUrl = this.resolveProviderBaseUrl(integration);
    const endpoint = integration.config?.sendContractPath || '/api/v1/requests';

    const recipientPayload: Record<string, any> = {
      type: 'EMAIL',
      email: data.recipient.email,
      name: data.recipient.name,
      metaData: {
        workspaceId,
        userId,
        contactId: data.contactId,
        dealId: data.dealId,
      },
    };

    if (data.recipient.phone) {
      recipientPayload.phone = data.recipient.phone;
    }

    const rawFields = (data.fields as any)?.fields || data.fields;
    if (Array.isArray(rawFields)) {
      recipientPayload.fields = rawFields;
    }

    const payload: Record<string, any> = {
      recipients: [recipientPayload],
      signInOrder: false,
      extractTags: false,
      emailSubject: data.name,
      senderName: integration.config?.senderName || undefined,
      tags: ['crm', workspaceId].filter(Boolean),
    };

    if (data.templateId) {
      payload.templateId = data.templateId;
    } else if (data.fileName) {
      payload.fileName = data.fileName;
    }

    if (apiUrl) {
      try {
        const response = await this.httpService.axiosRef.post(
          this.buildProviderUrl(apiUrl, endpoint),
          payload,
          {
            headers: this.buildProviderHeaders(integration),
          },
        );

        const responseData = response.data || {};
        const externalId = this.getFirstNonEmpty(
          responseData?.id,
          responseData?.requestId,
          responseData?.documentId,
          responseData?.contractId,
          responseData?.uuid,
          responseData?.data?.id,
          responseData?.data?.requestId,
          responseData?.data?.documentId,
          responseData?.data?.contractId,
          responseData?.request?.id,
          responseData?.request?.requestId,
          responseData?.request?.documentId,
          responseData?.request?.contractId,
          responseData?.result?.id,
          responseData?.result?.requestId,
        );

        if (!externalId) {
          throw new Error('eSemneaza response missing document id');
        }

        const createRecipients = [
          ...(Array.isArray(responseData?.recipients) ? responseData.recipients : []),
          ...(Array.isArray(responseData?.data?.recipients) ? responseData.data.recipients : []),
          ...(Array.isArray(responseData?.request?.recipients) ? responseData.request.recipients : []),
          ...(Array.isArray(responseData?.document?.recipients) ? responseData.document.recipients : []),
        ];
        const normalizedRecipientEmail = String(data?.recipient?.email || '').trim().toLowerCase();
        const matchingRecipient = createRecipients.find(
          (recipient: any) =>
            String(recipient?.email || '').trim().toLowerCase() === normalizedRecipientEmail,
        );
        const firstRecipient = matchingRecipient || createRecipients[0];

        let signingUrl = this.getFirstNonEmpty(
          firstRecipient?.signUrl,
          firstRecipient?.signingUrl,
          firstRecipient?.sign_url,
          firstRecipient?.signing_url,
          firstRecipient?.phoneUrl,
          firstRecipient?.url,
          responseData?.signingUrl,
          responseData?.signUrl,
          responseData?.signing_url,
          responseData?.sign_url,
          responseData?.url,
          responseData?.data?.signingUrl,
          responseData?.data?.signUrl,
          responseData?.data?.signing_url,
          responseData?.data?.sign_url,
          responseData?.data?.url,
          responseData?.request?.signingUrl,
          responseData?.request?.signUrl,
          responseData?.request?.url,
        );

        if (!signingUrl) {
          const detailsPathTemplate = String(
            integration.config?.requestDetailsPath || '/api/v1/requests/{requestId}',
          );
          const detailsPath = detailsPathTemplate.includes('{requestId}')
            ? detailsPathTemplate.replace('{requestId}', encodeURIComponent(externalId))
            : `${detailsPathTemplate.replace(/\/+$/, '')}/${encodeURIComponent(externalId)}`;

          try {
            const detailsResponse = await this.httpService.axiosRef.get(
              this.buildProviderUrl(apiUrl, detailsPath),
              {
                headers: this.buildProviderHeaders(integration),
              },
            );
            const detailsData = detailsResponse.data || {};
            const detailRecipients = [
              ...(Array.isArray(detailsData?.recipients) ? detailsData.recipients : []),
              ...(Array.isArray(detailsData?.data?.recipients) ? detailsData.data.recipients : []),
            ];
            const detailMatchingRecipient = detailRecipients.find(
              (recipient: any) =>
                String(recipient?.email || '').trim().toLowerCase() === normalizedRecipientEmail,
            );
            const detailFirstRecipient = detailMatchingRecipient || detailRecipients[0];
            signingUrl = this.getFirstNonEmpty(
              detailFirstRecipient?.signUrl,
              detailFirstRecipient?.signingUrl,
              detailFirstRecipient?.sign_url,
              detailFirstRecipient?.signing_url,
              detailFirstRecipient?.phoneUrl,
              detailFirstRecipient?.url,
              detailsData?.signingUrl,
              detailsData?.signUrl,
              detailsData?.signing_url,
              detailsData?.sign_url,
              detailsData?.url,
            );
          } catch (detailsError) {
            this.logger.warn(
              `Could not resolve eSemneaza signing URL from details for request ${externalId}: ${this.extractHttpErrorMessage(detailsError)}`,
            );
          }
        }

        if (!signingUrl) {
          const signingBaseUrl = this.getFirstNonEmpty(
            integration.config?.signingBaseUrl,
            integration.config?.appUrl,
          );
          if (signingBaseUrl) {
            signingUrl = `${signingBaseUrl.replace(/\/$/, '')}/${externalId}`;
          }
        }

        if (!signingUrl) {
          this.logger.warn(
            `eSemneaza create response missing signing URL for request ${externalId}. Document will be created without direct sign link.`,
          );
        }

        return {
          externalId,
          signingUrl,
          documentUrl: this.getFirstNonEmpty(
            responseData?.documentUrl,
            responseData?.docUrl,
            responseData?.data?.documentUrl,
            responseData?.data?.docUrl,
            responseData?.request?.documentUrl,
            responseData?.request?.docUrl,
          ),
          raw: responseData,
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
          this.buildProviderUrl(apiUrl, endpoint),
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

  private async getEsemneazaDocumentContext(
    workspaceId: string,
    documentId: string,
  ): Promise<{ document: Document; integration: Integration; apiUrl: string; requestId: string }> {
    const document = await this.documentRepository.findOne({
      where: { id: documentId, workspaceId },
      relations: ['deal', 'contact'],
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (!document.integrationId) {
      throw new BadRequestException('Document is not linked to an eSemneaza integration');
    }

    const integration = await this.assertProviderIntegration(document.integrationId, ['esemneaza']);
    if (integration.workspaceId !== workspaceId) {
      throw new UnauthorizedException('Integration workspace mismatch');
    }

    const apiUrl = this.resolveProviderBaseUrl(integration);
    if (!apiUrl) {
      throw new BadRequestException('eSemneaza API URL is not configured');
    }

    const requestId = String(document.externalId || '').trim();
    if (!requestId) {
      throw new BadRequestException('Document has no eSemneaza request id');
    }

    return { document, integration, apiUrl, requestId };
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
    sendEmail?: boolean;
    sendWhatsApp?: boolean;
  }): Promise<boolean> {
    const paymentLink =
      params.paymentLink ||
      (params.document.metadata?.payment as Record<string, any> | undefined)?.paymentLink;

    if (!paymentLink) {
      this.logger.warn(`Post-signature sequence skipped for ${params.document.id}: missing payment link`);
      return false;
    }

    const greetingName = params.contactName ? `, ${params.contactName}` : '';
    const shouldSendEmail = params.sendEmail !== false;
    const shouldSendWhatsApp = params.sendWhatsApp !== false;
    let sentAtLeastOne = false;
    const emailTarget = params.email?.trim();
    if (shouldSendEmail && emailTarget) {
      const sentEmail = await this.emailService.sendEmail({
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
      if (sentEmail) {
        sentAtLeastOne = true;
      }
    }

    const phoneTarget = params.phone?.trim();
    if (shouldSendWhatsApp && phoneTarget) {
      try {
        await this.whatsAppService.sendMessageForWorkspace(params.workspaceId, {
          to: phoneTarget,
          type: 'text',
          content: `Contractul "${params.document.name}" a fost semnat. Link plata: ${paymentLink}`,
        });
        sentAtLeastOne = true;
      } catch (error) {
        this.logger.warn(`WhatsApp sequence failed for document ${params.document.id}: ${error.message}`);
        await this.notifyDocumentStakeholders(params.document, {
          title: 'WhatsApp netrimis',
          message: `Contractul este semnat, dar mesajul WhatsApp nu a fost trimis: ${error.message}`,
        });
      }
    }

    if (shouldSendWhatsApp && !phoneTarget) {
      this.logger.warn(`WhatsApp sequence skipped for document ${params.document.id}: recipient phone missing`);
    }

    return sentAtLeastOne;
  }

  private async fetchEsemneazaRequestsPayload(
    integration: Integration,
    apiUrl: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<any> {
    const configuredPath = String(
      this.getFirstNonEmpty(
        integration.config?.listDocumentsPath,
        integration.config?.listContractsPath,
        '/api/v1/requests',
      ),
    );
    const defaultPath = '/api/v1/requests';
    const pathCandidates = configuredPath === defaultPath
      ? [configuredPath]
      : [configuredPath, defaultPath];

    const queryParams: Record<string, string | number | undefined> = {
      cursor: options?.cursor ? String(options.cursor).trim() : undefined,
      limit:
        typeof options?.limit === 'number' &&
        Number.isFinite(options.limit) &&
        options.limit > 0
          ? Math.min(Math.trunc(options.limit), 100)
          : undefined,
    };

    let lastError: any;
    for (const path of pathCandidates) {
      const baseUrl = this.buildProviderUrl(apiUrl, path);
      const urlsToTry = [
        this.buildUrlWithQueryParams(baseUrl, queryParams),
        baseUrl,
      ].filter((url, index, arr) => arr.indexOf(url) === index);

      for (const url of urlsToTry) {
        try {
          const response = await this.httpService.axiosRef.get(url, {
            headers: this.buildProviderHeaders(integration),
          });
          return response.data;
        } catch (error) {
          lastError = error;
          const status = (error as any)?.response?.status;
          const shouldRetry = status === 400 || status === 404;
          if (!shouldRetry) {
            throw error;
          }
        }
      }
    }

    throw lastError || new Error('Could not fetch eSemneaza requests');
  }

  private getPayfunnelEndpointCandidates(
    integration: Integration,
    kind: 'payments' | 'subscriptions' | 'links',
  ): string[] {
    const config = integration.config || {};
    const credentials = integration.credentials || {};
    const endpoints = (config.endpoints && typeof config.endpoints === 'object'
      ? config.endpoints
      : {}) as Record<string, any>;

    const byKind: Record<'payments' | 'subscriptions' | 'links', Array<any>> = {
      payments: [
        config.listPaymentsPath,
        config.paymentsPath,
        config.listTransactionsPath,
        config.transactionsPath,
        config.ordersPath,
        endpoints.listPaymentsPath,
        endpoints.payments,
        endpoints.transactions,
        endpoints.orders,
        credentials.listPaymentsPath,
        credentials.paymentsPath,
        '/payments',
        '/transactions',
        '/orders',
        '/api/v1/payments',
        '/api/v1/transactions',
        '/api/v1/orders',
        '/v1/payments',
        '/v1/transactions',
        '/external-api/v1/payments',
        '/external-api/v1/transactions',
      ],
      subscriptions: [
        config.listSubscriptionsPath,
        config.subscriptionsPath,
        config.membershipsPath,
        endpoints.listSubscriptionsPath,
        endpoints.subscriptions,
        endpoints.memberships,
        credentials.listSubscriptionsPath,
        credentials.subscriptionsPath,
        '/subscriptions',
        '/memberships',
        '/recurring/subscriptions',
        '/api/v1/subscriptions',
        '/api/v1/memberships',
        '/v1/subscriptions',
        '/external-api/v1/subscriptions',
      ],
      links: [
        config.listPaymentLinksPath,
        config.paymentLinksPath,
        config.listLinksPath,
        endpoints.listPaymentLinksPath,
        endpoints.paymentLinks,
        endpoints.paymentlinks,
        endpoints.links,
        credentials.listPaymentLinksPath,
        credentials.paymentLinksPath,
        '/paymentlinks',
        '/payments/links',
        '/payment-links',
        '/links',
        '/api/v1/paymentlinks',
        '/api/v1/payments/links',
        '/api/v1/payment-links',
        '/api/v1/links',
        '/v1/paymentlinks',
        '/v1/payments/links',
        '/external-api/v1/paymentlinks',
        '/external-api/v1/payment-links',
      ],
    };

    return byKind[kind]
      .map((value) => String(value || '').trim())
      .filter((value, index, arr) => !!value && arr.indexOf(value) === index);
  }

  private getPayfunnelApiBase(integration: Integration): string {
    const config = integration.config || {};
    const credentials = integration.credentials || {};
    const endpoints = (config.endpoints && typeof config.endpoints === 'object'
      ? config.endpoints
      : {}) as Record<string, any>;

    const explicitBase = this.getFirstNonEmpty(
      config.apiUrl,
      config.baseUrl,
      config.paymentApiUrl,
      config.paymentsApiUrl,
      config.paymentBaseUrl,
      config.checkoutBaseUrl,
      endpoints.baseUrl,
      endpoints.apiUrl,
      credentials.apiUrl,
      credentials.baseUrl,
    );
    if (explicitBase) {
      return explicitBase;
    }

    const firstAbsoluteEndpoint = [
      ...this.getPayfunnelEndpointCandidates(integration, 'payments'),
      ...this.getPayfunnelEndpointCandidates(integration, 'subscriptions'),
      ...this.getPayfunnelEndpointCandidates(integration, 'links'),
    ].find((value) => /^https?:\/\//i.test(value));
    const originFromEndpoint = this.deriveOriginFromUrl(firstAbsoluteEndpoint);
    if (originFromEndpoint) {
      return originFromEndpoint;
    }

    const configuredLinks = this.extractConfiguredPayfunnelLinks(integration);
    const originFromLink = this.deriveOriginFromUrl(configuredLinks[0]?.url);
    if (originFromLink) {
      return originFromLink;
    }

    return '';
  }

  private deriveOriginFromUrl(value?: string): string | undefined {
    const raw = String(value || '').trim();
    if (!raw || !/^https?:\/\//i.test(raw)) {
      return undefined;
    }
    try {
      const parsed = new URL(raw);
      return `${parsed.protocol}//${parsed.host}`;
    } catch {
      return undefined;
    }
  }

  private async fetchProviderRowsWithFallback(
    integration: Integration,
    apiUrl: string,
    endpointCandidates: Array<string | undefined>,
    keys: string[],
    queryParams?: Record<string, string | number | undefined>,
  ): Promise<any[]> {
    const cleanedEndpoints = endpointCandidates
      .map((entry) => String(entry || '').trim())
      .filter((entry, index, arr) => !!entry && arr.indexOf(entry) === index);

    if (cleanedEndpoints.length === 0) {
      throw new Error('No endpoint candidates configured');
    }

    let lastError: any;
    let firstSuccessfulRows: any[] | null = null;
    for (const endpoint of cleanedEndpoints) {
      const baseUrl = this.buildProviderUrl(apiUrl, endpoint);
      const urlsToTry = [
        this.buildUrlWithQueryParams(baseUrl, queryParams || {}),
        baseUrl,
      ].filter((url, index, arr) => arr.indexOf(url) === index);

      for (const url of urlsToTry) {
        try {
          const rows = await this.fetchProviderRowsWithPagination(
            integration,
            url,
            keys,
            queryParams,
          );
          if (rows.length > 0) {
            return rows;
          }
          if (firstSuccessfulRows === null) {
            firstSuccessfulRows = rows;
          }
        } catch (error) {
          lastError = error;
          const status = (error as any)?.response?.status;
          if (status === 400 || status === 404) {
            continue;
          }
          throw error;
        }
      }
    }

    if (firstSuccessfulRows !== null) {
      return firstSuccessfulRows;
    }

    throw lastError || new Error('Could not fetch provider rows');
  }

  private async fetchProviderRowsWithPagination(
    integration: Integration,
    initialUrl: string,
    keys: string[],
    queryParams?: Record<string, string | number | undefined>,
  ): Promise<any[]> {
    const maxRowsRaw = Number(
      integration.config?.payfunnelImportMaxRows ||
      integration.config?.importMaxRows ||
      integration.credentials?.payfunnelImportMaxRows ||
      integration.credentials?.importMaxRows ||
      queryParams?.limit ||
      2000,
    );
    const maxRows =
      Number.isFinite(maxRowsRaw) && maxRowsRaw > 0
        ? Math.min(Math.floor(maxRowsRaw), 10000)
        : 2000;
    const maxPagesRaw = Number(
      integration.config?.payfunnelImportMaxPages ||
      integration.config?.importMaxPages ||
      integration.credentials?.payfunnelImportMaxPages ||
      integration.credentials?.importMaxPages ||
      25,
    );
    const maxPages =
      Number.isFinite(maxPagesRaw) && maxPagesRaw > 0
        ? Math.min(Math.floor(maxPagesRaw), 100)
        : 25;

    const rows: any[] = [];
    const visitedUrls = new Set<string>();
    const headers = this.buildProviderHeaders(integration);
    let currentUrl = initialUrl;
    let fallbackPage = 1;

    for (let iteration = 0; iteration < maxPages; iteration += 1) {
      if (!currentUrl || visitedUrls.has(currentUrl)) {
        break;
      }
      visitedUrls.add(currentUrl);

      const response = await this.httpService.axiosRef.get(currentUrl, { headers });
      const payload = response.data;
      const chunk = this.extractApiRows(payload, keys);
      if (chunk.length > 0) {
        rows.push(...chunk);
      }
      if (rows.length >= maxRows) {
        break;
      }

      const nextByUrl = this.resolvePaginationNextUrl(payload, currentUrl);
      if (nextByUrl && !visitedUrls.has(nextByUrl)) {
        currentUrl = nextByUrl;
        continue;
      }

      const nextCursor = this.extractPaginationNextCursor(payload);
      if (nextCursor) {
        const nextCursorUrl = this.removeQueryParam(
          this.upsertQueryParam(currentUrl, 'cursor', nextCursor),
          'page',
        );
        if (nextCursorUrl && !visitedUrls.has(nextCursorUrl)) {
          currentUrl = nextCursorUrl;
          continue;
        }
      }

      const payloadCurrentPage = this.extractPaginationCurrentPage(payload);
      const payloadTotalPages = this.extractPaginationTotalPages(payload);
      if (payloadCurrentPage !== undefined) {
        fallbackPage = payloadCurrentPage;
      }

      const hasMore = this.extractPaginationHasMore(payload);
      const shouldPageForward =
        hasMore === true ||
        (payloadCurrentPage !== undefined &&
          payloadTotalPages !== undefined &&
          payloadCurrentPage < payloadTotalPages);
      if (shouldPageForward) {
        const nextPage = Math.max(fallbackPage + 1, 2);
        const nextPageUrl = this.removeQueryParam(
          this.upsertQueryParam(currentUrl, 'page', String(nextPage)),
          'cursor',
        );
        if (nextPageUrl && !visitedUrls.has(nextPageUrl)) {
          fallbackPage = nextPage;
          currentUrl = nextPageUrl;
          continue;
        }
      }

      break;
    }

    if (rows.length <= maxRows) {
      return rows;
    }
    return rows.slice(0, maxRows);
  }

  private resolvePaginationNextUrl(payload: any, currentUrl: string): string | undefined {
    const nextValue = this.getFirstNonEmpty(
      payload?.next,
      payload?.nextUrl,
      payload?.next_url,
      payload?.nextPage,
      payload?.next_page_url,
      payload?.pagination?.next,
      payload?.pagination?.nextUrl,
      payload?.pagination?.next_url,
      payload?.pagination?.nextPage,
      payload?.meta?.next,
      payload?.meta?.nextUrl,
      payload?.meta?.next_url,
      payload?.links?.next,
      payload?.links?.next?.href,
      payload?.data?.next,
      payload?.data?.nextUrl,
      payload?.data?.next_url,
      payload?.data?.nextPage,
      payload?.data?.pagination?.next,
      payload?.data?.links?.next,
      payload?.data?.links?.next?.href,
    );
    return this.normalizePaginationNextUrl(nextValue, currentUrl);
  }

  private normalizePaginationNextUrl(nextValue: any, currentUrl: string): string | undefined {
    const raw = String(nextValue || '').trim();
    if (!raw) {
      return undefined;
    }
    const normalized = raw.toLowerCase();
    if (['null', 'undefined', 'false', '0', '#'].includes(normalized)) {
      return undefined;
    }

    try {
      return new URL(raw, currentUrl).toString();
    } catch {
      return undefined;
    }
  }

  private extractPaginationNextCursor(payload: any): string | undefined {
    const rawCursor = this.getFirstNonEmpty(
      payload?.nextCursor,
      payload?.next_cursor,
      payload?.cursor?.next,
      payload?.pagination?.nextCursor,
      payload?.pagination?.next_cursor,
      payload?.meta?.nextCursor,
      payload?.meta?.next_cursor,
      payload?.data?.nextCursor,
      payload?.data?.next_cursor,
      payload?.data?.pagination?.nextCursor,
      payload?.data?.meta?.nextCursor,
    );
    const cursor = String(rawCursor || '').trim();
    if (!cursor || ['null', 'undefined'].includes(cursor.toLowerCase())) {
      return undefined;
    }
    return cursor;
  }

  private extractPaginationCurrentPage(payload: any): number | undefined {
    const value = this.parseIntegerValue(
      payload?.page,
      payload?.currentPage,
      payload?.current_page,
      payload?.pagination?.page,
      payload?.pagination?.currentPage,
      payload?.pagination?.current_page,
      payload?.meta?.page,
      payload?.meta?.currentPage,
      payload?.meta?.current_page,
      payload?.data?.page,
      payload?.data?.currentPage,
      payload?.data?.current_page,
    );
    return value !== undefined && value > 0 ? value : undefined;
  }

  private extractPaginationTotalPages(payload: any): number | undefined {
    const value = this.parseIntegerValue(
      payload?.totalPages,
      payload?.total_pages,
      payload?.lastPage,
      payload?.last_page,
      payload?.pagination?.totalPages,
      payload?.pagination?.total_pages,
      payload?.pagination?.lastPage,
      payload?.pagination?.last_page,
      payload?.meta?.totalPages,
      payload?.meta?.total_pages,
      payload?.meta?.lastPage,
      payload?.meta?.last_page,
      payload?.data?.totalPages,
      payload?.data?.total_pages,
      payload?.data?.lastPage,
      payload?.data?.last_page,
    );
    return value !== undefined && value > 0 ? value : undefined;
  }

  private extractPaginationHasMore(payload: any): boolean | undefined {
    return this.parseBooleanLike(
      payload?.hasMore,
      payload?.has_more,
      payload?.pagination?.hasMore,
      payload?.pagination?.has_more,
      payload?.pagination?.hasNext,
      payload?.pagination?.has_next,
      payload?.meta?.hasMore,
      payload?.meta?.has_more,
      payload?.data?.hasMore,
      payload?.data?.has_more,
      payload?.data?.pagination?.hasMore,
      payload?.data?.pagination?.has_more,
    );
  }

  private parseBooleanLike(...values: any[]): boolean | undefined {
    for (const value of values) {
      if (value === null || value === undefined || value === '') {
        continue;
      }
      if (typeof value === 'boolean') {
        return value;
      }
      const normalized = String(value).trim().toLowerCase();
      if (['true', '1', 'yes'].includes(normalized)) {
        return true;
      }
      if (['false', '0', 'no'].includes(normalized)) {
        return false;
      }
    }
    return undefined;
  }

  private upsertQueryParam(url: string, key: string, value: string): string {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set(key, value);
      return parsed.toString();
    } catch {
      return url;
    }
  }

  private removeQueryParam(url: string, key: string): string {
    try {
      const parsed = new URL(url);
      parsed.searchParams.delete(key);
      return parsed.toString();
    } catch {
      return url;
    }
  }

  private parseNumberValue(...values: any[]): number | undefined {
    for (const value of values) {
      if (value === null || value === undefined || value === '') {
        continue;
      }
      const numeric = Number(
        typeof value === 'string' ? value.replace(',', '.').replace(/\s+/g, '') : value,
      );
      if (Number.isFinite(numeric)) {
        return numeric;
      }
    }
    return undefined;
  }

  private parseIntegerValue(...values: any[]): number | undefined {
    const numeric = this.parseNumberValue(...values);
    if (numeric === undefined) {
      return undefined;
    }
    if (!Number.isFinite(numeric)) {
      return undefined;
    }
    const rounded = Math.trunc(numeric);
    if (rounded < 0) {
      return undefined;
    }
    return rounded;
  }

  private normalizeDateString(...values: any[]): string | undefined {
    for (const value of values) {
      if (!value) continue;
      if (value instanceof Date && !Number.isNaN(value.getTime())) {
        return value.toISOString();
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
        const byNumber = new Date(timestamp);
        if (!Number.isNaN(byNumber.getTime())) {
          return byNumber.toISOString();
        }
      }
      if (typeof value === 'string') {
        const normalized = value.trim();
        const mmDdYyyyMatch = normalized.match(/^(\d{2})-(\d{2})-(\d{4})$/);
        if (mmDdYyyyMatch) {
          const month = Number(mmDdYyyyMatch[1]);
          const day = Number(mmDdYyyyMatch[2]);
          const year = Number(mmDdYyyyMatch[3]);
          if (
            Number.isFinite(month) &&
            Number.isFinite(day) &&
            Number.isFinite(year) &&
            month >= 1 &&
            month <= 12 &&
            day >= 1 &&
            day <= 31
          ) {
            const byMdY = new Date(Date.UTC(year, month - 1, day));
            if (!Number.isNaN(byMdY.getTime())) {
              return byMdY.toISOString();
            }
          }
        }

        const yyyyMmDdMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (yyyyMmDdMatch) {
          const year = Number(yyyyMmDdMatch[1]);
          const month = Number(yyyyMmDdMatch[2]);
          const day = Number(yyyyMmDdMatch[3]);
          if (
            Number.isFinite(month) &&
            Number.isFinite(day) &&
            Number.isFinite(year) &&
            month >= 1 &&
            month <= 12 &&
            day >= 1 &&
            day <= 31
          ) {
            const byYmd = new Date(Date.UTC(year, month - 1, day));
            if (!Number.isNaN(byYmd.getTime())) {
              return byYmd.toISOString();
            }
          }
        }

        const parsed = new Date(value);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toISOString();
        }
      }
    }
    return undefined;
  }

  private parsePayfunnelPaymentRow(row: any): PayfunnelDashboardPayment | null {
    const id = this.getFirstNonEmpty(
      row?.id,
      row?.paymentId,
      row?.transactionId,
      row?.transaction?.id,
      row?.orderId,
      row?.uuid,
      row?._id,
      row?.data?.id,
      row?.data?.paymentId,
      row?.data?.transactionId,
      row?.data?.transaction?.id,
      row?.data?.orderId,
    );
    if (!id) return null;

    const rawStatus = this.getFirstNonEmpty(
      row?.status,
      row?.paymentStatus,
      row?.transactionStatus,
      row?.orderStatus,
      row?.payment_state,
      row?.result,
      row?.state,
      row?.data?.status,
      row?.data?.paymentStatus,
      row?.data?.transactionStatus,
      row?.data?.orderStatus,
      row?.data?.payment_state,
      row?.data?.result,
      row?.data?.state,
    );
    const amount = this.parseNumberValue(
      row?.amount,
      row?.totalAmountPaid,
      row?.total_amount_paid,
      row?.chargeAmount,
      row?.chargedAmount,
      row?.amountPaid,
      row?.paidAmount,
      row?.totalAmount,
      row?.grossAmount,
      row?.netAmount,
      row?.total,
      row?.value,
      row?.price,
      row?.transaction?.amount,
      row?.transaction?.total,
      row?.data?.amount,
      row?.data?.totalAmountPaid,
      row?.data?.total_amount_paid,
      row?.data?.chargeAmount,
      row?.data?.chargedAmount,
      row?.data?.amountPaid,
      row?.data?.paidAmount,
      row?.data?.totalAmount,
      row?.data?.grossAmount,
      row?.data?.netAmount,
      row?.data?.total,
      row?.data?.value,
      row?.data?.transaction?.amount,
    );
    const productRows = [
      ...(Array.isArray(row?.products) ? row.products : []),
      ...(Array.isArray(row?.items) ? row.items : []),
      ...(Array.isArray(row?.lineItems) ? row.lineItems : []),
      ...(Array.isArray(row?.data?.products) ? row.data.products : []),
      ...(Array.isArray(row?.data?.items) ? row.data.items : []),
      ...(Array.isArray(row?.data?.lineItems) ? row.data.lineItems : []),
    ];
    const productNames = Array.from(new Set(
      productRows
        .map((entry: any) => this.getFirstNonEmpty(entry?.name, entry?.title, entry?.label, entry?.productName))
        .filter((entry): entry is string => !!entry),
    ));

    return {
      id,
      status: this.normalizePaymentStatus(rawStatus),
      paymentReference: this.getFirstNonEmpty(
        row?.paymentReference,
        row?.reference,
        row?.transactionReference,
        row?.invoiceNumber,
        row?.orderNumber,
        row?.orderReference,
        row?.metadata?.paymentReference,
        row?.metadata?.orderId,
        row?.transaction?.reference,
        row?.data?.paymentReference,
        row?.data?.reference,
        row?.data?.transactionReference,
        row?.data?.invoiceNumber,
        row?.data?.orderNumber,
        row?.data?.metadata?.paymentReference,
        row?.data?.transaction?.reference,
        row?.data?.invoiceId,
      ),
      title: this.getFirstNonEmpty(
        row?.title,
        row?.paymentTitle,
        row?.descriptionTitle,
        row?.data?.title,
        row?.data?.paymentTitle,
      ),
      description: this.getFirstNonEmpty(
        row?.description,
        row?.details,
        row?.data?.description,
        row?.data?.details,
      ),
      rawStatus,
      failureReason: this.getFirstNonEmpty(
        row?.failureReason,
        row?.declineReason,
        row?.reason,
        row?.errorMessage,
        row?.message,
        row?.data?.failureReason,
        row?.data?.declineReason,
        row?.data?.reason,
        row?.data?.errorMessage,
        row?.data?.message,
      ),
      amount,
      currency: this.getFirstNonEmpty(
        row?.currency,
        row?.currencyCode,
        row?.amount?.currency,
        row?.transaction?.currency,
        row?.data?.currency,
        row?.data?.currencyCode,
        row?.data?.amount?.currency,
        row?.data?.transaction?.currency,
        row?.customer?.currency,
      ),
      taxAmount: this.parseNumberValue(
        row?.taxAmount,
        row?.tax,
        row?.data?.taxAmount,
        row?.data?.tax,
      ),
      processingFeeAmount: this.parseNumberValue(
        row?.processingFeeAmount,
        row?.processingFees,
        row?.fees,
        row?.data?.processingFeeAmount,
        row?.data?.processingFees,
        row?.data?.fees,
      ),
      setupFeeAmount: this.parseNumberValue(
        row?.setupFeeAmount,
        row?.setupFee,
        row?.oneTimeSetupFeeAmount,
        row?.data?.setupFeeAmount,
        row?.data?.setupFee,
        row?.data?.oneTimeSetupFeeAmount,
      ),
      refundAmount: this.parseNumberValue(
        row?.refundAmount,
        row?.refundedAmount,
        row?.data?.refundAmount,
        row?.data?.refundedAmount,
      ),
      quantity: this.parseIntegerValue(
        row?.quantity,
        row?.qty,
        row?.data?.quantity,
        row?.data?.qty,
      ),
      customerName: this.getFirstNonEmpty(
        row?.customerName,
        row?.customer?.name,
        row?.customer?.fullName,
        row?.billingName,
        row?.billing?.name,
        row?.payerName,
        row?.buyerName,
        row?.data?.customerName,
        row?.data?.customer?.name,
        row?.data?.billingName,
        row?.data?.billing?.name,
        row?.data?.payerName,
      ),
      customerId: this.getFirstNonEmpty(
        row?.customerId,
        row?.customer?.id,
        row?.payerId,
        row?.data?.customerId,
        row?.data?.customer?.id,
        row?.data?.payerId,
      ),
      customerEmail: this.normalizeEmail(this.getFirstNonEmpty(
        row?.customerEmail,
        row?.email,
        row?.billingEmail,
        row?.billing?.email,
        row?.payerEmail,
        row?.customer?.email,
        row?.customer?.contact?.email,
        row?.data?.customerEmail,
        row?.data?.email,
        row?.data?.billingEmail,
        row?.data?.billing?.email,
        row?.data?.payerEmail,
        row?.data?.customer?.email,
        row?.data?.customer?.contact?.email,
      )),
      paymentMethodType: this.getFirstNonEmpty(
        row?.paymentMethodType,
        row?.paymentMethod?.type,
        row?.method,
        row?.data?.paymentMethodType,
        row?.data?.paymentMethod?.type,
        row?.data?.method,
      ),
      cardLast4: this.getFirstNonEmpty(
        row?.cardLast4,
        row?.paymentMethod?.card?.last4,
        row?.paymentMethod?.last4,
        row?.data?.cardLast4,
        row?.data?.paymentMethod?.card?.last4,
        row?.data?.paymentMethod?.last4,
      ),
      ...(productNames.length > 0 ? { productNames } : {}),
      subscriptionId: this.getFirstNonEmpty(
        row?.subscriptionId,
        row?.subscription?.id,
        row?.membershipId,
        row?.data?.subscriptionId,
        row?.data?.subscription?.id,
        row?.data?.membershipId,
      ),
      subscriptionStatus: this.getFirstNonEmpty(
        row?.subscriptionStatus,
        row?.subscription?.status,
        row?.subscription?.state,
        row?.data?.subscriptionStatus,
        row?.data?.subscription?.status,
      ),
      subscriptionPlanName: this.getFirstNonEmpty(
        row?.subscriptionPlanName,
        row?.subscription?.planName,
        row?.subscription?.plan?.name,
        row?.data?.subscriptionPlanName,
        row?.data?.subscription?.planName,
        row?.data?.subscription?.plan?.name,
      ),
      subscriptionStartedAt: this.normalizeDateString(
        row?.subscriptionStartedAt,
        row?.subscription?.startedAt,
        row?.subscription?.startDate,
        row?.data?.subscriptionStartedAt,
        row?.data?.subscription?.startedAt,
      ),
      subscriptionEndsAt: this.normalizeDateString(
        row?.subscriptionEndsAt,
        row?.subscription?.expiresAt,
        row?.subscription?.currentPeriodEndAt,
        row?.subscription?.canceledAt,
        row?.data?.subscriptionEndsAt,
        row?.data?.subscription?.expiresAt,
      ),
      subscriptionPaidPayments: this.parseIntegerValue(
        row?.subscriptionPaidPayments,
        row?.subscription?.paidPayments,
        row?.subscription?.paymentsMade,
        row?.data?.subscriptionPaidPayments,
        row?.data?.subscription?.paidPayments,
      ),
      subscriptionRemainingPayments: this.parseIntegerValue(
        row?.subscriptionRemainingPayments,
        row?.subscription?.remainingPayments,
        row?.subscription?.paymentsRemaining,
        row?.data?.subscriptionRemainingPayments,
        row?.data?.subscription?.remainingPayments,
      ),
      subscriptionTotalPayments: this.parseIntegerValue(
        row?.subscriptionTotalPayments,
        row?.subscription?.totalPayments,
        row?.subscription?.installments,
        row?.data?.subscriptionTotalPayments,
        row?.data?.subscription?.totalPayments,
      ),
      paymentLinkId: this.getFirstNonEmpty(
        row?.paymentLinkId,
        row?.linkId,
        row?.paymentLink?.linkId,
        row?.checkoutId,
        row?.paymentLink?.id,
        row?.data?.paymentLinkId,
        row?.data?.linkId,
        row?.data?.paymentLink?.linkId,
        row?.data?.checkoutId,
      ),
      paymentLinkName: this.getFirstNonEmpty(
        row?.paymentLinkName,
        row?.paymentLink?.name,
        row?.paymentLink?.title,
        row?.linkName,
        row?.title,
        row?.data?.paymentLinkName,
        row?.data?.paymentLink?.name,
        row?.data?.paymentLink?.title,
        row?.data?.linkName,
      ),
      paymentUrl: this.getFirstNonEmpty(
        row?.paymentUrl,
        row?.checkoutUrl,
        row?.url,
        row?.link,
        row?.data?.paymentUrl,
        row?.data?.checkoutUrl,
        row?.data?.url,
      ),
      createdAt: this.normalizeDateString(
        row?.createdAt,
        row?.created_at,
        row?.created,
        row?.createdOn,
        row?.createdDate,
        row?.date,
        row?.timestamp,
        row?.data?.createdAt,
        row?.data?.created_at,
        row?.data?.created,
        row?.data?.createdOn,
        row?.data?.createdDate,
      ),
      paidAt: this.normalizeDateString(
        row?.paidAt,
        row?.completedAt,
        row?.capturedAt,
        row?.settledAt,
        row?.successAt,
        row?.paidDate,
        row?.updatedAt,
        row?.updated_at,
        row?.data?.paidAt,
        row?.data?.completedAt,
        row?.data?.capturedAt,
        row?.data?.settledAt,
        row?.data?.successAt,
        row?.data?.paidDate,
        row?.data?.updatedAt,
        row?.data?.updated_at,
      ),
    };
  }

  private parsePayfunnelSubscriptionRow(row: any): PayfunnelDashboardSubscription | null {
    const id = this.getFirstNonEmpty(
      row?.id,
      row?.subscriptionId,
      row?.membershipId,
      row?.subscription?.id,
      row?.uuid,
      row?._id,
      row?.data?.id,
      row?.data?.subscriptionId,
      row?.data?.membershipId,
      row?.data?.subscription?.id,
    );
    if (!id) return null;

    const totalPayments = this.parseIntegerValue(
      row?.totalPayments,
      row?.paymentsTotal,
      row?.totalMaxPayment,
      row?.installments,
      row?.installmentsTotal,
      row?.installmentsCount,
      row?.billingCycles,
      row?.cyclesTotal,
      row?.totalCycles,
      row?.numberOfPayments,
      row?.plan?.installments,
      row?.plan?.paymentsCount,
      row?.stats?.totalPayments,
      row?.statistics?.totalPayments,
      row?.summary?.totalPayments,
      row?.data?.totalPayments,
      row?.data?.paymentsTotal,
      row?.data?.totalMaxPayment,
      row?.data?.installments,
      row?.data?.installmentsTotal,
      row?.data?.plan?.installments,
      row?.data?.stats?.totalPayments,
      row?.data?.statistics?.totalPayments,
      row?.data?.summary?.totalPayments,
    );
    const paidPayments = this.parseIntegerValue(
      row?.paidPayments,
      row?.paymentsMade,
      row?.completedPayments,
      row?.successfulPayments,
      row?.successfulCharges,
      row?.chargesPaid,
      row?.installmentsPaid,
      row?.stats?.paidPayments,
      row?.statistics?.paidPayments,
      row?.summary?.paidPayments,
      row?.data?.paidPayments,
      row?.data?.paymentsMade,
      row?.data?.completedPayments,
      row?.data?.successfulPayments,
      row?.data?.installmentsPaid,
      row?.data?.stats?.paidPayments,
      row?.data?.statistics?.paidPayments,
      row?.data?.summary?.paidPayments,
    );
    const failedPayments = this.parseIntegerValue(
      row?.failedPayments,
      row?.paymentsFailed,
      row?.failedCharges,
      row?.declinedPayments,
      row?.stats?.failedPayments,
      row?.statistics?.failedPayments,
      row?.summary?.failedPayments,
      row?.data?.failedPayments,
      row?.data?.paymentsFailed,
      row?.data?.failedCharges,
      row?.data?.declinedPayments,
      row?.data?.stats?.failedPayments,
      row?.data?.statistics?.failedPayments,
      row?.data?.summary?.failedPayments,
    );
    const remainingPaymentsRaw = this.parseIntegerValue(
      row?.remainingPayments,
      row?.paymentsRemaining,
      row?.installmentsRemaining,
      row?.remainingInstallments,
      row?.cyclesLeft,
      row?.leftPayments,
      row?.stats?.remainingPayments,
      row?.statistics?.remainingPayments,
      row?.summary?.remainingPayments,
      row?.data?.remainingPayments,
      row?.data?.paymentsRemaining,
      row?.data?.installmentsRemaining,
      row?.data?.remainingInstallments,
      row?.data?.cyclesLeft,
      row?.data?.leftPayments,
      row?.data?.stats?.remainingPayments,
      row?.data?.statistics?.remainingPayments,
      row?.data?.summary?.remainingPayments,
    );
    const amountPerCharge = this.parseNumberValue(
      row?.chargeAmount,
      row?.amount,
      row?.price,
      row?.data?.chargeAmount,
      row?.data?.amount,
      row?.data?.price,
    );
    const totalCollectedAmount = this.parseNumberValue(
      row?.totalCollectedAmount,
      row?.collectedAmount,
      row?.data?.totalCollectedAmount,
      row?.data?.collectedAmount,
    );
    const totalDueAmount = this.parseNumberValue(
      row?.totalDueAmount,
      row?.dueAmount,
      row?.data?.totalDueAmount,
      row?.data?.dueAmount,
    );
    const inferredPaidFromCollectedAmount =
      amountPerCharge !== undefined &&
      amountPerCharge > 0 &&
      totalCollectedAmount !== undefined
        ? Math.max(Math.trunc(totalCollectedAmount / amountPerCharge), 0)
        : undefined;
    const inferredRemainingFromDueAmount =
      amountPerCharge !== undefined &&
      amountPerCharge > 0 &&
      totalDueAmount !== undefined
        ? Math.max(Math.trunc(totalDueAmount / amountPerCharge), 0)
        : undefined;
    const totalMaxPayment = this.parseIntegerValue(
      row?.totalMaxPayment,
      row?.maxPayments,
      row?.maxInstallments,
      row?.data?.totalMaxPayment,
      row?.data?.maxPayments,
      row?.data?.maxInstallments,
    );
    const effectiveTotalPayments = totalPayments ?? totalMaxPayment;
    const inferredPaidPayments =
      paidPayments !== undefined
        ? paidPayments
        : inferredPaidFromCollectedAmount !== undefined
          ? inferredPaidFromCollectedAmount
          : effectiveTotalPayments !== undefined && remainingPaymentsRaw !== undefined
            ? Math.max(effectiveTotalPayments - remainingPaymentsRaw, 0)
            : undefined;
    const remainingPayments =
      remainingPaymentsRaw !== undefined
        ? remainingPaymentsRaw
        : inferredRemainingFromDueAmount !== undefined
          ? inferredRemainingFromDueAmount
          : effectiveTotalPayments !== undefined && inferredPaidPayments !== undefined
            ? Math.max(effectiveTotalPayments - inferredPaidPayments, 0)
            : undefined;

    return {
      id,
      status: this.getFirstNonEmpty(
        row?.status,
        row?.state,
        row?.subscriptionStatus,
        row?.subscription?.status,
        row?.subscription?.state,
        row?.data?.status,
        row?.data?.state,
        row?.data?.subscriptionStatus,
        row?.data?.subscription?.status,
      ),
      title: this.getFirstNonEmpty(
        row?.title,
        row?.name,
        row?.planName,
        row?.data?.title,
        row?.data?.name,
      ),
      customerName: this.getFirstNonEmpty(
        row?.customerName,
        row?.customer?.name,
        row?.customer?.fullName,
        row?.billingName,
        row?.payerName,
        row?.subscriberName,
        row?.data?.customerName,
        row?.data?.customer?.name,
        row?.data?.billingName,
        row?.data?.payerName,
      ),
      customerEmail: this.normalizeEmail(this.getFirstNonEmpty(
        row?.customerEmail,
        row?.email,
        row?.billingEmail,
        row?.payerEmail,
        row?.customer?.email,
        row?.subscriberEmail,
        row?.data?.customerEmail,
        row?.data?.email,
        row?.data?.billingEmail,
        row?.data?.payerEmail,
        row?.data?.customer?.email,
      )),
      customerId: this.getFirstNonEmpty(
        row?.customerId,
        row?.customer?.id,
        row?.subscriberId,
        row?.data?.customerId,
        row?.data?.customer?.id,
        row?.data?.subscriberId,
      ),
      planName: this.getFirstNonEmpty(
        row?.planName,
        row?.plan?.name,
        row?.productName,
        row?.title,
        row?.name,
        row?.data?.planName,
        row?.data?.title,
        row?.data?.plan?.name,
      ),
      interval: this.getFirstNonEmpty(
        row?.interval,
        row?.billingCycle,
        row?.paymentType,
        row?.period,
        row?.data?.interval,
        row?.data?.billingCycle,
        row?.data?.paymentType,
      ),
      paymentType: this.getFirstNonEmpty(
        row?.paymentType,
        row?.type,
        row?.data?.paymentType,
        row?.data?.type,
      ),
      amount: this.parseNumberValue(
        row?.amount,
        row?.chargeAmount,
        row?.price,
        row?.plan?.amount,
        row?.data?.amount,
        row?.data?.chargeAmount,
        row?.data?.price,
        row?.data?.plan?.amount,
      ),
      chargeAmount: this.parseNumberValue(
        row?.chargeAmount,
        row?.data?.chargeAmount,
      ),
      currency: this.getFirstNonEmpty(
        row?.currency,
        row?.currencyCode,
        row?.plan?.currency,
        row?.data?.currency,
        row?.data?.currencyCode,
        row?.data?.plan?.currency,
      ),
      totalCollectedAmount,
      totalSubscriptionAmount: this.parseNumberValue(
        row?.totalSubscriptionAmount,
        row?.subscriptionAmount,
        row?.data?.totalSubscriptionAmount,
        row?.data?.subscriptionAmount,
      ),
      totalDueAmount,
      totalMaxPayment,
      startedAt: this.normalizeDateString(
        row?.startedAt,
        row?.startDate,
        row?.created,
        row?.createdAt,
        row?.data?.startedAt,
        row?.data?.startDate,
        row?.data?.created,
        row?.data?.createdAt,
      ),
      nextBillingAt: this.normalizeDateString(
        row?.nextBillingAt,
        row?.nextChargeAt,
        row?.renewAt,
        row?.nextPaymentAt,
        row?.nextPaymentDate,
        row?.data?.nextBillingAt,
        row?.data?.nextChargeAt,
        row?.data?.renewAt,
        row?.data?.nextPaymentAt,
        row?.data?.nextPaymentDate,
      ),
      currentPeriodStartAt: this.normalizeDateString(
        row?.currentPeriodStartAt,
        row?.currentPeriodStart,
        row?.periodStartAt,
        row?.periodStart,
        row?.billingPeriodStart,
        row?.data?.currentPeriodStartAt,
        row?.data?.currentPeriodStart,
        row?.data?.periodStartAt,
        row?.data?.periodStart,
      ),
      currentPeriodEndAt: this.normalizeDateString(
        row?.currentPeriodEndAt,
        row?.currentPeriodEnd,
        row?.periodEndAt,
        row?.periodEnd,
        row?.billingPeriodEnd,
        row?.data?.currentPeriodEndAt,
        row?.data?.currentPeriodEnd,
        row?.data?.periodEndAt,
        row?.data?.periodEnd,
      ),
      trialEndsAt: this.normalizeDateString(
        row?.trialEndsAt,
        row?.trialEndAt,
        row?.trialEnd,
        row?.data?.trialEndsAt,
        row?.data?.trialEndAt,
        row?.data?.trialEnd,
      ),
      expiresAt: this.normalizeDateString(
        row?.expiresAt,
        row?.expiryAt,
        row?.expiryDate,
        row?.endDate,
        row?.endsAt,
        row?.endedAt,
        row?.data?.expiresAt,
        row?.data?.expiryAt,
        row?.data?.expiryDate,
        row?.data?.endDate,
        row?.data?.endsAt,
        row?.data?.endedAt,
      ),
      lastPaymentAt: this.normalizeDateString(
        row?.lastPaymentAt,
        row?.lastPaidAt,
        row?.latestPaymentAt,
        row?.data?.lastPaymentAt,
        row?.data?.lastPaidAt,
        row?.data?.latestPaymentAt,
      ),
      canceledAt: this.normalizeDateString(
        row?.canceledAt,
        row?.cancelledAt,
        row?.endedAt,
        row?.data?.canceledAt,
        row?.data?.cancelledAt,
      ),
      paidPayments: inferredPaidPayments,
      failedPayments,
      remainingPayments,
      totalPayments: effectiveTotalPayments,
    };
  }

  private attachPayfunnelSubscriptionDataToPayments(
    payments: PayfunnelDashboardPayment[],
    subscriptions: PayfunnelDashboardSubscription[],
  ): PayfunnelDashboardPayment[] {
    if (!Array.isArray(payments) || payments.length === 0 || !Array.isArray(subscriptions) || subscriptions.length === 0) {
      return payments;
    }

    const subscriptionsById = new Map<string, PayfunnelDashboardSubscription>();
    const subscriptionsByEmail = new Map<string, PayfunnelDashboardSubscription>();

    for (const subscription of subscriptions) {
      const subscriptionId = String(subscription.id || '').trim();
      if (subscriptionId) {
        subscriptionsById.set(subscriptionId, subscription);
      }

      const normalizedEmail = this.normalizeEmail(subscription.customerEmail);
      if (!normalizedEmail) {
        continue;
      }

      const existing = subscriptionsByEmail.get(normalizedEmail);
      if (!existing) {
        subscriptionsByEmail.set(normalizedEmail, subscription);
        continue;
      }

      const currentTs = this.parseDateToTimestamp(
        this.getFirstNonEmpty(
          subscription.nextBillingAt,
          subscription.currentPeriodEndAt,
          subscription.expiresAt,
          subscription.startedAt,
        ),
      );
      const existingTs = this.parseDateToTimestamp(
        this.getFirstNonEmpty(
          existing.nextBillingAt,
          existing.currentPeriodEndAt,
          existing.expiresAt,
          existing.startedAt,
        ),
      );
      if (currentTs >= existingTs) {
        subscriptionsByEmail.set(normalizedEmail, subscription);
      }
    }

    return payments.map((payment) => {
      const subscriptionById = payment.subscriptionId
        ? subscriptionsById.get(String(payment.subscriptionId).trim())
        : undefined;
      const normalizedPaymentEmail = this.normalizeEmail(payment.customerEmail);
      const subscriptionByEmail = normalizedPaymentEmail
        ? subscriptionsByEmail.get(normalizedPaymentEmail)
        : undefined;
      const matchedSubscription = subscriptionById || subscriptionByEmail;
      if (!matchedSubscription) {
        return payment;
      }

      const inferredSubscriptionEnd = this.getFirstNonEmpty(
        matchedSubscription.expiresAt,
        matchedSubscription.currentPeriodEndAt,
        matchedSubscription.canceledAt,
      );

      return {
        ...payment,
        subscriptionId: payment.subscriptionId || matchedSubscription.id,
        subscriptionStatus: payment.subscriptionStatus || matchedSubscription.status,
        subscriptionPlanName: payment.subscriptionPlanName || matchedSubscription.planName,
        subscriptionStartedAt: payment.subscriptionStartedAt || matchedSubscription.startedAt,
        subscriptionEndsAt: payment.subscriptionEndsAt || inferredSubscriptionEnd,
        subscriptionPaidPayments:
          payment.subscriptionPaidPayments !== undefined
            ? payment.subscriptionPaidPayments
            : matchedSubscription.paidPayments,
        subscriptionRemainingPayments:
          payment.subscriptionRemainingPayments !== undefined
            ? payment.subscriptionRemainingPayments
            : matchedSubscription.remainingPayments,
        subscriptionTotalPayments:
          payment.subscriptionTotalPayments !== undefined
            ? payment.subscriptionTotalPayments
            : matchedSubscription.totalPayments,
      };
    });
  }

  private deduplicatePayfunnelPayments(rows: PayfunnelDashboardPayment[]): PayfunnelDashboardPayment[] {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }

    const merged = new Map<string, PayfunnelDashboardPayment>();
    for (const row of rows) {
      const key = this.getFirstNonEmpty(
        row.id,
        row.paymentReference,
        `${this.normalizeEmail(row.customerEmail) || 'unknown'}:${row.createdAt || ''}:${row.status}:${row.amount ?? ''}`,
      ) as string;

      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, row);
        continue;
      }
      merged.set(key, this.pickPreferredPayfunnelPayment(existing, row));
    }

    return Array.from(merged.values()).sort((a, b) => {
      const tsA = this.parseDateToTimestamp(
        this.getFirstNonEmpty(a.paidAt, a.createdAt, a.subscriptionEndsAt),
      );
      const tsB = this.parseDateToTimestamp(
        this.getFirstNonEmpty(b.paidAt, b.createdAt, b.subscriptionEndsAt),
      );
      return tsB - tsA;
    });
  }

  private deduplicatePayfunnelSubscriptions(rows: PayfunnelDashboardSubscription[]): PayfunnelDashboardSubscription[] {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }

    const merged = new Map<string, PayfunnelDashboardSubscription>();
    for (const row of rows) {
      const key = this.getFirstNonEmpty(
        row.id,
        `${this.normalizeEmail(row.customerEmail) || 'unknown'}:${row.planName || ''}:${row.startedAt || ''}`,
      ) as string;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, row);
        continue;
      }
      const currentScore = this.countNonEmptyValues(row);
      const existingScore = this.countNonEmptyValues(existing);
      if (currentScore >= existingScore) {
        merged.set(key, { ...existing, ...row });
      }
    }

    return Array.from(merged.values()).sort((a, b) => {
      const tsA = this.parseDateToTimestamp(
        this.getFirstNonEmpty(a.nextBillingAt, a.expiresAt, a.startedAt),
      );
      const tsB = this.parseDateToTimestamp(
        this.getFirstNonEmpty(b.nextBillingAt, b.expiresAt, b.startedAt),
      );
      return tsB - tsA;
    });
  }

  private deduplicatePayfunnelLinks(rows: PayfunnelDashboardLink[]): PayfunnelDashboardLink[] {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }

    const merged = new Map<string, PayfunnelDashboardLink>();
    for (const row of rows) {
      const key = `${row.id}:${row.url}`.toLowerCase();
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, row);
        continue;
      }

      const currentScore = this.countNonEmptyValues(row);
      const existingScore = this.countNonEmptyValues(existing);
      if (currentScore >= existingScore) {
        merged.set(key, { ...existing, ...row });
      }
    }

    return Array.from(merged.values()).sort((a, b) => {
      const tsA = this.parseDateToTimestamp(a.createdAt);
      const tsB = this.parseDateToTimestamp(b.createdAt);
      return tsB - tsA;
    });
  }

  private pickPreferredPayfunnelPayment(
    existing: PayfunnelDashboardPayment,
    incoming: PayfunnelDashboardPayment,
  ): PayfunnelDashboardPayment {
    const statusRank: Record<PayfunnelDashboardPayment['status'], number> = {
      paid: 3,
      failed: 2,
      pending: 1,
    };
    const existingRank = statusRank[existing.status] || 0;
    const incomingRank = statusRank[incoming.status] || 0;
    if (incomingRank > existingRank) {
      return { ...existing, ...incoming };
    }
    if (incomingRank < existingRank) {
      return { ...incoming, ...existing };
    }

    const existingScore = this.countNonEmptyValues(existing);
    const incomingScore = this.countNonEmptyValues(incoming);
    if (incomingScore > existingScore) {
      return { ...existing, ...incoming };
    }
    if (incomingScore < existingScore) {
      return { ...incoming, ...existing };
    }

    const existingTs = this.parseDateToTimestamp(
      this.getFirstNonEmpty(existing.paidAt, existing.createdAt, existing.subscriptionEndsAt),
    );
    const incomingTs = this.parseDateToTimestamp(
      this.getFirstNonEmpty(incoming.paidAt, incoming.createdAt, incoming.subscriptionEndsAt),
    );
    if (incomingTs >= existingTs) {
      return { ...existing, ...incoming };
    }
    return { ...incoming, ...existing };
  }

  private countNonEmptyValues(value: Record<string, any>): number {
    if (!value || typeof value !== 'object') {
      return 0;
    }
    return Object.values(value).filter((entry) => {
      if (entry === null || entry === undefined) {
        return false;
      }
      if (typeof entry === 'string') {
        return entry.trim() !== '';
      }
      if (Array.isArray(entry)) {
        return entry.length > 0;
      }
      return true;
    }).length;
  }

  private buildPaymentSubscriptionMetadata(payment: PayfunnelDashboardPayment): Record<string, any> {
    const snapshot: Record<string, any> = {};
    const subscriptionId = String(payment.subscriptionId || '').trim();
    if (subscriptionId) {
      snapshot.subscriptionId = subscriptionId;
    }
    const subscriptionStatus = String(payment.subscriptionStatus || '').trim();
    if (subscriptionStatus) {
      snapshot.subscriptionStatus = subscriptionStatus;
    }
    const subscriptionPlanName = String(payment.subscriptionPlanName || '').trim();
    if (subscriptionPlanName) {
      snapshot.subscriptionPlanName = subscriptionPlanName;
    }

    const subscriptionStartedAt = this.normalizeDateString(payment.subscriptionStartedAt);
    if (subscriptionStartedAt) {
      snapshot.subscriptionStartedAt = subscriptionStartedAt;
    }
    const subscriptionEndsAt = this.normalizeDateString(payment.subscriptionEndsAt);
    if (subscriptionEndsAt) {
      snapshot.subscriptionEndsAt = subscriptionEndsAt;
    }

    if (payment.subscriptionPaidPayments !== undefined) {
      snapshot.subscriptionPaidPayments = payment.subscriptionPaidPayments;
    }
    if (payment.subscriptionRemainingPayments !== undefined) {
      snapshot.subscriptionRemainingPayments = payment.subscriptionRemainingPayments;
    }
    if (payment.subscriptionTotalPayments !== undefined) {
      snapshot.subscriptionTotalPayments = payment.subscriptionTotalPayments;
    }

    return snapshot;
  }

  private hasPaymentMetadataPatchChanges(
    currentMetadata: Record<string, any>,
    patch: Record<string, any>,
  ): boolean {
    const entries = Object.entries(patch).filter(([, value]) => value !== undefined && value !== null);
    if (entries.length === 0) {
      return false;
    }

    for (const [key, nextValue] of entries) {
      const currentValue = currentMetadata?.[key];
      if (typeof nextValue === 'number') {
        const currentNumber = Number(currentValue);
        if (!Number.isFinite(currentNumber) || currentNumber !== nextValue) {
          return true;
        }
        continue;
      }

      if (String(currentValue ?? '').trim() !== String(nextValue).trim()) {
        return true;
      }
    }

    return false;
  }

  private parseDateToTimestamp(value?: string): number {
    if (!value) return 0;
    const ts = new Date(value).getTime();
    return Number.isFinite(ts) ? ts : 0;
  }

  private parsePayfunnelLinkRow(
    row: any,
    source: 'integration_config' | 'payfunnel_api' | 'crm_documents',
  ): PayfunnelDashboardLink | null {
    const url = this.getFirstNonEmpty(
      row?.url,
      row?.paymentUrl,
      row?.checkoutUrl,
      row?.checkout_url,
      row?.link,
      row?.shortUrl,
      row?.short_url,
      row?.data?.url,
      row?.data?.paymentUrl,
      row?.data?.checkoutUrl,
      row?.data?.checkout_url,
      row?.data?.shortUrl,
      row?.data?.short_url,
    );
    if (!url) return null;

    return {
      id: this.getFirstNonEmpty(row?.id, row?.linkId, row?.uuid, row?.slug, url) as string,
      name: this.getFirstNonEmpty(row?.name, row?.title, row?.label, row?.slug, url) as string,
      url,
      status: this.getFirstNonEmpty(
        row?.status,
        row?.state,
        row?.data?.status,
      ),
      createdAt: this.normalizeDateString(
        row?.createdAt,
        row?.created_at,
        row?.data?.createdAt,
        row?.data?.created_at,
      ),
      source,
    };
  }

  private async getLocalPayfunnelDashboardSnapshot(
    workspaceId: string,
  ): Promise<{ payments: PayfunnelDashboardPayment[]; links: PayfunnelDashboardLink[] }> {
    const documents = await this.documentRepository
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.contact', 'contact')
      .where('document.workspaceId = :workspaceId', { workspaceId })
      .andWhere(`document.metadata ? 'payment'`)
      .orderBy('document.updatedAt', 'DESC')
      .take(500)
      .getMany();

    const payments: PayfunnelDashboardPayment[] = [];
    const linksMap = new Map<string, PayfunnelDashboardLink>();

    for (const document of documents) {
      const payment = { ...((document.metadata?.payment as Record<string, any>) || {}) };
      const status = this.normalizePaymentStatus(payment.status);
      const paymentId = this.getFirstNonEmpty(
        payment.externalPaymentId,
        payment.paymentReference,
        document.id,
      ) as string;
      const paymentLink = this.getFirstNonEmpty(payment.paymentLink, payment.preferredLinkUrl);
      const contactName = document.contact
        ? `${document.contact.firstName || ''} ${document.contact.lastName || ''}`.trim()
        : undefined;
      const customerName = this.getFirstNonEmpty(
        contactName,
        this.getPrimaryRecipient(document).name,
      );
      const customerEmail = this.getFirstNonEmpty(
        document.contact?.email,
        this.getPrimaryRecipient(document).email,
      );

      payments.push({
        id: paymentId,
        status,
        rawStatus: this.getFirstNonEmpty(payment.status),
        failureReason: this.getFirstNonEmpty(payment.failureReason),
        amount: this.parseNumberValue(payment.amount, document.deal?.value),
        currency: this.getFirstNonEmpty(payment.currency, document.deal?.currency, 'EUR'),
        customerName,
        customerEmail,
        subscriptionId: this.getFirstNonEmpty(payment.subscriptionId),
        subscriptionStatus: this.getFirstNonEmpty(payment.subscriptionStatus),
        subscriptionPlanName: this.getFirstNonEmpty(payment.subscriptionPlanName),
        subscriptionStartedAt: this.normalizeDateString(payment.subscriptionStartedAt),
        subscriptionEndsAt: this.normalizeDateString(payment.subscriptionEndsAt),
        subscriptionPaidPayments: this.parseIntegerValue(payment.subscriptionPaidPayments),
        subscriptionRemainingPayments: this.parseIntegerValue(payment.subscriptionRemainingPayments),
        subscriptionTotalPayments: this.parseIntegerValue(payment.subscriptionTotalPayments),
        paymentLinkId: this.getFirstNonEmpty(payment.paymentLinkId),
        paymentLinkName: this.getFirstNonEmpty(payment.preferredLinkName),
        paymentUrl: paymentLink,
        createdAt: this.normalizeDateString(payment.createdAt, document.createdAt),
        paidAt: this.normalizeDateString(payment.paidAt),
      });

      if (paymentLink) {
        const linkEntry: PayfunnelDashboardLink = {
          id: this.getFirstNonEmpty(payment.paymentLinkId, payment.paymentReference, document.id) as string,
          name: this.getFirstNonEmpty(payment.preferredLinkName, document.name, paymentLink) as string,
          url: paymentLink,
          status: this.getFirstNonEmpty(payment.status),
          createdAt: this.normalizeDateString(payment.createdAt, document.createdAt),
          source: 'crm_documents',
        };
        const key = `${linkEntry.id}:${linkEntry.url}`.toLowerCase();
        if (!linksMap.has(key)) {
          linksMap.set(key, linkEntry);
        }
      }
    }

    return {
      payments,
      links: Array.from(linksMap.values()),
    };
  }

  private buildPaymentsBaseQuery(
    workspaceId: string,
    search?: string,
  ): SelectQueryBuilder<Document> {
    const query = this.documentRepository
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.contact', 'contact')
      .leftJoinAndSelect('document.deal', 'deal')
      .where('document.workspaceId = :workspaceId', { workspaceId })
      .andWhere(`document.metadata ? 'payment'`);

    if (search) {
      query.andWhere(
        `(
          document.name ILIKE :search
          OR COALESCE(contact.firstName, '') ILIKE :search
          OR COALESCE(contact.lastName, '') ILIKE :search
          OR COALESCE(contact.email, '') ILIKE :search
          OR COALESCE(deal.title, '') ILIKE :search
          OR COALESCE(document.metadata->'payment'->>'paymentReference', '') ILIKE :search
        )`,
        { search: `%${search}%` },
      );
    }

    return query;
  }

  private normalizePaymentFilter(rawStatus?: string): 'all' | 'paid' | 'failed' | 'pending' {
    const normalized = String(rawStatus || '').trim().toLowerCase();
    if (['paid', 'failed', 'pending'].includes(normalized)) {
      return normalized as 'paid' | 'failed' | 'pending';
    }
    return 'all';
  }

  private normalizePaymentStatus(rawStatus?: string): 'paid' | 'failed' | 'pending' {
    const normalized = String(rawStatus || '').trim().toLowerCase();
    if (/(paid|succeeded|success|completed|approved|captured|settled|confirmed)/.test(normalized)) {
      return 'paid';
    }
    if (/(failed|declined|insufficient|canceled|cancelled|error|rejected|refused|voided|chargeback)/.test(normalized)) {
      return 'failed';
    }
    return 'pending';
  }

  private async applyPaymentStatusSideEffects(
    document: Document,
    status: 'paid' | 'failed',
    failureReason?: string,
  ): Promise<void> {
    const now = new Date();

    let contact = document.contact;
    if (!contact && document.contactId) {
      contact = await this.contactRepository.findOne({
        where: { id: document.contactId, workspaceId: document.workspaceId },
      });
    }

    if (contact) {
      if (status === 'paid') {
        contact.status = ContactStatus.CUSTOMER;
      }
      contact.lastContactedAt = now;
      const contactCustomFields = { ...(contact.customFields || {}) } as Record<string, any>;
      contactCustomFields.lastPaymentStatus = status;
      contactCustomFields.lastPaymentDocumentId = document.id;
      contactCustomFields.lastPaymentEventAt = now.toISOString();
      if (status === 'failed') {
        contactCustomFields.lastPaymentFailureReason = failureReason || 'Plata esuata';
      } else {
        delete contactCustomFields.lastPaymentFailureReason;
      }
      contact.customFields = contactCustomFields;

      const savedContact = await this.contactRepository.save(contact);
      this.eventEmitter.emit('contact.updated', {
        workspaceId: document.workspaceId,
        contact: savedContact,
        changes: {
          status: savedContact.status,
          lastPaymentStatus: status,
          source: 'payfunnel.webhook',
          documentId: document.id,
        },
      });
      this.eventEmitter.emit('contact_updated', {
        workspaceId: document.workspaceId,
        contact: savedContact,
        changes: {
          status: savedContact.status,
          lastPaymentStatus: status,
          source: 'payfunnel.webhook',
          documentId: document.id,
        },
        occurredAt: now.toISOString(),
      });
    }

    let deal = document.deal;
    if (!deal && document.dealId) {
      deal = await this.dealRepository.findOne({
        where: { id: document.dealId, workspaceId: document.workspaceId },
      });
    }

    if (deal) {
      const oldStage = deal.stage;
      const stageChanged = status === 'paid' && deal.stage !== DealStage.CLOSED_WON;
      if (stageChanged) {
        deal.stage = DealStage.CLOSED_WON;
        deal.actualCloseDate = deal.actualCloseDate || now;
        deal.closedDate = deal.closedDate || now;
      }

      deal.lastActivityAt = now;
      const dealCustomFields = { ...(deal.customFields || {}) } as Record<string, any>;
      dealCustomFields.lastPaymentStatus = status;
      dealCustomFields.lastPaymentDocumentId = document.id;
      dealCustomFields.lastPaymentEventAt = now.toISOString();
      if (status === 'failed') {
        dealCustomFields.lastPaymentFailureReason = failureReason || 'Plata esuata';
      } else {
        delete dealCustomFields.lastPaymentFailureReason;
      }
      deal.customFields = dealCustomFields;

      const savedDeal = await this.dealRepository.save(deal);
      this.eventEmitter.emit('deal.updated', {
        workspaceId: document.workspaceId,
        deal: savedDeal,
        changes: {
          ...(stageChanged ? { stage: DealStage.CLOSED_WON } : {}),
          lastPaymentStatus: status,
          source: 'payfunnel.webhook',
          documentId: document.id,
        },
        oldStage,
      });

      if (stageChanged) {
        this.eventEmitter.emit('deal.won', {
          workspaceId: document.workspaceId,
          deal: savedDeal,
        });
      }
    }
  }

  private async maybeRefreshPayfunnelPayments(workspaceId: string): Promise<void> {
    const now = Date.now();
    const lastRefresh = this.payfunnelPaymentsRefreshAtByWorkspace.get(workspaceId) || 0;
    if (now - lastRefresh < this.payfunnelPaymentsRefreshCooldownMs) {
      return;
    }

    this.payfunnelPaymentsRefreshAtByWorkspace.set(workspaceId, now);

    try {
      await this.getPayfunnelDashboardData(workspaceId);
    } catch (error) {
      this.logger.warn(`PayFunnels refresh before payments list failed for workspace ${workspaceId}: ${error.message}`);
    }
  }

  private extractApiRows(payload: any, keys: string[]): any[] {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;

    const searchKeys = Array.from(new Set([
      ...keys,
      'items',
      'results',
      'data',
      'rows',
      'records',
      'transactions',
      'payments',
      'orders',
      'subscriptions',
      'memberships',
      'links',
      'paymentLinks',
      'paymentlinks',
      'docs',
      'list',
    ]));

    const queue: any[] = [payload];
    const visited = new Set<any>();

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object' || visited.has(current)) {
        continue;
      }
      visited.add(current);

      for (const key of searchKeys) {
        const value = current?.[key];
        if (Array.isArray(value)) {
          return value;
        }
      }

      const wrapperValues = [
        current?.data,
        current?.result,
        current?.results,
        current?.payload,
        current?.response,
        current?.meta,
        current?.pagination,
      ];
      for (const entry of wrapperValues) {
        if (entry && typeof entry === 'object') {
          queue.push(entry);
        }
      }
    }

    return [];
  }

  private async getEsemneazaRequestDownloadUrl(
    workspaceId: string,
    requestId: string,
    pathTemplate: string,
    errorPrefix: string,
  ): Promise<{ requestId: string; docUrl: string }> {
    const normalizedRequestId = String(requestId || '').trim();
    if (!normalizedRequestId) {
      throw new BadRequestException('requestId is required');
    }

    const integration = await this.findApiProviderIntegration(workspaceId, ['esemneaza'], true);
    const apiUrl = this.resolveProviderBaseUrl(integration);
    if (!apiUrl) {
      throw new BadRequestException('eSemneaza API URL is not configured');
    }

    const path = pathTemplate.includes('{requestId}')
      ? pathTemplate.replace('{requestId}', encodeURIComponent(normalizedRequestId))
      : `${pathTemplate.replace(/\/+$/, '')}/${encodeURIComponent(normalizedRequestId)}`;

    try {
      const response = await this.httpService.axiosRef.get(
        this.buildProviderUrl(apiUrl, path),
        {
          headers: this.buildProviderHeaders(integration),
        },
      );

      const responseData = response.data || {};
      const docUrl = this.getFirstNonEmpty(responseData?.docUrl, responseData?.url);
      if (!docUrl) {
        throw new Error('Missing docUrl in provider response');
      }

      return {
        requestId: this.getFirstNonEmpty(responseData?.requestId, normalizedRequestId) as string,
        docUrl,
      };
    } catch (error) {
      throw new BadRequestException(`${errorPrefix}: ${this.extractHttpErrorMessage(error)}`);
    }
  }

  private parseDateValue(value: any): Date | undefined {
    if (!value) return undefined;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    return parsed;
  }

  private mapDocumentType(rawType?: string): DocumentType {
    const normalized = String(rawType || '').trim().toLowerCase();
    if (!normalized) return DocumentType.CONTRACT;

    if (normalized.includes('quote') || normalized.includes('oferta')) return DocumentType.QUOTE;
    if (normalized.includes('invoice') || normalized.includes('factura')) return DocumentType.INVOICE;
    if (normalized.includes('nda')) return DocumentType.NDA;
    if (normalized.includes('sow')) return DocumentType.SOW;
    if (normalized.includes('msa')) return DocumentType.MSA;
    if (normalized.includes('proposal') || normalized.includes('propunere')) return DocumentType.PROPOSAL;
    if (normalized.includes('contract')) return DocumentType.CONTRACT;
    return DocumentType.OTHER;
  }

  private mapEsemneazaStatus(rawStatus?: string): DocumentStatus {
    const status = String(rawStatus || '').trim().toLowerCase();
    if (!status) return DocumentStatus.PENDING;

    if (['signed', 'completed', 'done', 'finalized', 'semnat', 'document.signed', 'contract.signed'].some((token) => status.includes(token))) {
      return DocumentStatus.SIGNED;
    }
    if (['viewed', 'opened', 'read', 'document.viewed', 'vizualizat'].some((token) => status.includes(token))) {
      return DocumentStatus.VIEWED;
    }
    if (['declined', 'rejected', 'refused', 'respins'].some((token) => status.includes(token))) {
      return DocumentStatus.DECLINED;
    }
    if (['voided', 'cancelled', 'canceled', 'anulat'].some((token) => status.includes(token))) {
      return DocumentStatus.VOIDED;
    }
    if (['expired', 'expirat'].some((token) => status.includes(token))) {
      return DocumentStatus.EXPIRED;
    }
    if (['draft', 'new', 'creat'].some((token) => status.includes(token))) {
      return DocumentStatus.DRAFT;
    }
    if (['sent', 'pending', 'in_progress', 'waiting', 'trimis'].some((token) => status.includes(token))) {
      return DocumentStatus.SENT;
    }
    return DocumentStatus.PENDING;
  }

  private normalizeRecipientStatus(rawStatus?: string): 'pending' | 'sent' | 'viewed' | 'signed' | 'declined' {
    const status = String(rawStatus || '').trim().toLowerCase();
    if (!status) return 'pending';
    if (['signed', 'completed', 'done', 'semnat'].some((token) => status.includes(token))) return 'signed';
    if (['viewed', 'opened', 'read', 'vizualizat'].some((token) => status.includes(token))) return 'viewed';
    if (['declined', 'rejected', 'respins', 'refused'].some((token) => status.includes(token))) return 'declined';
    if (['sent', 'pending', 'trimis', 'waiting'].some((token) => status.includes(token))) return 'sent';
    return 'pending';
  }

  private extractEsemneazaRecipients(row: any): Array<{
    email: string;
    name?: string;
    role?: string;
    order?: number;
    status?: 'pending' | 'sent' | 'viewed' | 'signed' | 'declined';
    signedAt?: Date;
    viewedAt?: Date;
    sentAt?: Date;
  }> {
    const rawList =
      (Array.isArray(row?.recipients) && row.recipients) ||
      (Array.isArray(row?.signers) && row.signers) ||
      (Array.isArray(row?.participants) && row.participants) ||
      (Array.isArray(row?.data?.recipients) && row.data.recipients) ||
      (Array.isArray(row?.data?.signers) && row.data.signers) ||
      [];

    const fromList = rawList
      .map((item: any, index: number) => {
        const email = this.getFirstNonEmpty(
          item?.email,
          item?.recipientEmail,
          item?.signerEmail,
          item?.contactEmail,
        );
        if (!email) return null;

        return {
          email,
          name: this.getFirstNonEmpty(item?.name, item?.fullName, item?.recipientName, item?.signerName),
          role: this.getFirstNonEmpty(item?.role, item?.type),
          order: typeof item?.order === 'number' ? item.order : index + 1,
          status: this.normalizeRecipientStatus(item?.status || item?.state),
          signedAt: this.parseDateValue(item?.signedAt || item?.completedAt),
          viewedAt: this.parseDateValue(item?.viewedAt || item?.openedAt),
          sentAt: this.parseDateValue(item?.sentAt || item?.createdAt),
        };
      })
      .filter((entry) => !!entry) as Array<{
      email: string;
      name?: string;
      role?: string;
      order?: number;
      status?: 'pending' | 'sent' | 'viewed' | 'signed' | 'declined';
      signedAt?: Date;
      viewedAt?: Date;
      sentAt?: Date;
    }>;

    if (fromList.length > 0) {
      return fromList;
    }

    const fallbackEmail = this.getFirstNonEmpty(
      row?.email,
      row?.recipientEmail,
      row?.signerEmail,
      row?.recipient?.email,
      row?.signer?.email,
      row?.data?.email,
      row?.data?.recipientEmail,
      row?.data?.signerEmail,
    );
    if (!fallbackEmail) return [];

    return [
      {
        email: fallbackEmail,
        name: this.getFirstNonEmpty(
          row?.recipientName,
          row?.signerName,
          row?.recipient?.name,
          row?.signer?.name,
          row?.data?.recipientName,
        ),
        role: 'signer',
        order: 1,
        status: this.normalizeRecipientStatus(row?.status || row?.state || row?.data?.status),
      },
    ];
  }

  private async findContactIdByEmail(workspaceId: string, email?: string): Promise<string | undefined> {
    if (!email || !email.includes('@')) return undefined;
    const normalized = email.trim().toLowerCase();
    const match = await this.contactRepository
      .createQueryBuilder('contact')
      .select(['contact.id'])
      .where('contact.workspaceId = :workspaceId', { workspaceId })
      .andWhere('LOWER(contact.email) = :email', { email: normalized })
      .orderBy('contact.updatedAt', 'DESC')
      .getOne();
    return match?.id;
  }

  private buildProviderHeaders(integration: Integration): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(integration.config?.headers || {}),
    };

    const providerKey = String(integration.config?.provider || integration.externalId || '').toLowerCase();

    const apiKey =
      integration.credentials?.apiKey ||
      integration.credentials?.apiToken ||
      integration.config?.apiKey ||
      integration.config?.token;
    const accessToken =
      integration.credentials?.accessToken ||
      integration.credentials?.bearerToken ||
      integration.config?.accessToken ||
      integration.config?.bearerToken;

    if (apiKey) {
      // PayFunnels classic API keys must be sent using the vendor-specific header.
      if (providerKey === 'payfunnels' || providerKey === 'payfunnel') {
        headers['x-pf-api-key'] = apiKey;
      } else {
        const authScheme = String(integration.config?.authScheme || 'Bearer').trim();
        if (authScheme.toLowerCase() === 'api-key') {
        headers['X-API-Key'] = apiKey;
        } else if (authScheme.toLowerCase() === 'token') {
        headers['Authorization'] = `Token ${apiKey}`;
        } else {
        headers['Authorization'] = `${authScheme} ${apiKey}`.trim();
        }
      }

      if (providerKey === 'esemneaza') {
        headers['X-API-Key'] = headers['X-API-Key'] || apiKey;
      }
    }

    if ((providerKey === 'payfunnels' || providerKey === 'payfunnel') && accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
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

  private getFirstNonEmpty(...values: Array<any>): string | undefined {
    for (const value of values) {
      if (value === null || value === undefined) {
        continue;
      }
      const normalized = String(value).trim();
      if (normalized) {
        return normalized;
      }
    }
    return undefined;
  }

  private normalizeEmail(value?: string): string | undefined {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) {
      return undefined;
    }
    return normalized;
  }

  private collectPayfunnelWebhookScopes(payload: any): Array<Record<string, any>> {
    const scopes = [
      payload,
      payload?.data,
      payload?.payment,
      payload?.transaction,
      payload?.order,
      payload?.eventData,
      payload?.object,
      payload?.resource,
      payload?.body,
      payload?.data?.payment,
      payload?.data?.transaction,
      payload?.data?.order,
      payload?.data?.eventData,
      payload?.data?.object,
      payload?.data?.resource,
      payload?.data?.body,
      payload?.transaction?.data,
      payload?.payment?.data,
      payload?.order?.data,
    ];
    const result: Array<Record<string, any>> = [];
    for (const scope of scopes) {
      if (!scope || typeof scope !== 'object' || Array.isArray(scope)) {
        continue;
      }
      if (!result.includes(scope)) {
        result.push(scope);
      }
    }
    return result;
  }

  private extractPayfunnelWebhookMetadataScopes(scopes: Array<Record<string, any>>): Array<Record<string, any>> {
    const metadata: Array<Record<string, any>> = [];
    for (const scope of scopes) {
      const source = scope?.metadata;
      if (!source || typeof source !== 'object' || Array.isArray(source)) {
        continue;
      }
      if (!metadata.includes(source)) {
        metadata.push(source);
      }
    }
    return metadata;
  }

  private extractPaymentCustomerEmail(payload: any): string | undefined {
    const scopes = this.collectPayfunnelWebhookScopes(payload);
    const metadataScopes = this.extractPayfunnelWebhookMetadataScopes(scopes);
    return this.normalizeEmail(
      this.getFirstNonEmpty(
        ...scopes.map((scope) => scope?.customerEmail),
        ...scopes.map((scope) => scope?.email),
        ...scopes.map((scope) => scope?.billingEmail),
        ...scopes.map((scope) => scope?.payerEmail),
        ...scopes.map((scope) => scope?.buyerEmail),
        ...scopes.map((scope) => scope?.customer?.email),
        ...scopes.map((scope) => scope?.customer?.contact?.email),
        ...scopes.map((scope) => scope?.payer?.email),
        ...metadataScopes.map((scope) => scope?.customerEmail),
        ...metadataScopes.map((scope) => scope?.email),
      ),
    );
  }

  private extractWebhookSubscriptionMetadata(payload: any): Record<string, any> {
    const scopes = this.collectPayfunnelWebhookScopes(payload);
    const metadataScopes = this.extractPayfunnelWebhookMetadataScopes(scopes);
    const scopeValues = (picker: (scope: Record<string, any>) => any): any[] => scopes.map(picker);

    const snapshot: Record<string, any> = {};
    const subscriptionId = this.getFirstNonEmpty(
      ...scopeValues((scope) => scope?.subscriptionId),
      ...scopeValues((scope) => scope?.subscription?.id),
      ...metadataScopes.map((scope) => scope?.subscriptionId),
    );
    if (subscriptionId) {
      snapshot.subscriptionId = subscriptionId;
    }

    const subscriptionStatus = this.getFirstNonEmpty(
      ...scopeValues((scope) => scope?.subscriptionStatus),
      ...scopeValues((scope) => scope?.subscription?.status),
      ...scopeValues((scope) => scope?.subscription?.state),
    );
    if (subscriptionStatus) {
      snapshot.subscriptionStatus = subscriptionStatus;
    }

    const subscriptionPlanName = this.getFirstNonEmpty(
      ...scopeValues((scope) => scope?.subscriptionPlanName),
      ...scopeValues((scope) => scope?.subscription?.planName),
      ...scopeValues((scope) => scope?.subscription?.plan?.name),
    );
    if (subscriptionPlanName) {
      snapshot.subscriptionPlanName = subscriptionPlanName;
    }

    const subscriptionStartedAt = this.normalizeDateString(
      ...scopeValues((scope) => scope?.subscriptionStartedAt),
      ...scopeValues((scope) => scope?.subscription?.startedAt),
      ...scopeValues((scope) => scope?.subscription?.startDate),
    );
    if (subscriptionStartedAt) {
      snapshot.subscriptionStartedAt = subscriptionStartedAt;
    }

    const subscriptionEndsAt = this.normalizeDateString(
      ...scopeValues((scope) => scope?.subscriptionEndsAt),
      ...scopeValues((scope) => scope?.subscription?.expiresAt),
      ...scopeValues((scope) => scope?.subscription?.currentPeriodEndAt),
      ...scopeValues((scope) => scope?.subscription?.canceledAt),
    );
    if (subscriptionEndsAt) {
      snapshot.subscriptionEndsAt = subscriptionEndsAt;
    }

    const subscriptionPaidPayments = this.parseIntegerValue(
      ...scopeValues((scope) => scope?.subscriptionPaidPayments),
      ...scopeValues((scope) => scope?.subscription?.paidPayments),
      ...scopeValues((scope) => scope?.subscription?.paymentsMade),
    );
    if (subscriptionPaidPayments !== undefined) {
      snapshot.subscriptionPaidPayments = subscriptionPaidPayments;
    }

    const subscriptionRemainingPayments = this.parseIntegerValue(
      ...scopeValues((scope) => scope?.subscriptionRemainingPayments),
      ...scopeValues((scope) => scope?.subscription?.remainingPayments),
      ...scopeValues((scope) => scope?.subscription?.paymentsRemaining),
    );
    if (subscriptionRemainingPayments !== undefined) {
      snapshot.subscriptionRemainingPayments = subscriptionRemainingPayments;
    }

    const subscriptionTotalPayments = this.parseIntegerValue(
      ...scopeValues((scope) => scope?.subscriptionTotalPayments),
      ...scopeValues((scope) => scope?.subscription?.totalPayments),
      ...scopeValues((scope) => scope?.subscription?.installments),
    );
    if (subscriptionTotalPayments !== undefined) {
      snapshot.subscriptionTotalPayments = subscriptionTotalPayments;
    }

    return snapshot;
  }

  private async findPayfunnelDocumentByPaymentIdentifiers(
    workspaceId: string,
    paymentReference?: string,
    externalPaymentId?: string,
    paymentLinkId?: string,
  ): Promise<Document | null> {
    const normalizedReference = String(paymentReference || '').trim().toLowerCase();
    const normalizedExternalPaymentId = String(externalPaymentId || '').trim().toLowerCase();
    const normalizedPaymentLinkId = String(paymentLinkId || '').trim().toLowerCase();
    if (!normalizedReference && !normalizedExternalPaymentId && !normalizedPaymentLinkId) {
      return null;
    }

    const query = this.documentRepository
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.contact', 'contact')
      .leftJoinAndSelect('document.deal', 'deal')
      .where('document.workspaceId = :workspaceId', { workspaceId })
      .andWhere(`LOWER(COALESCE(document.metadata->>'paymentSuppressed', 'false')) <> 'true'`);

    const clauses: string[] = [];
    const params: Record<string, string> = {};
    if (normalizedReference) {
      clauses.push(`LOWER(COALESCE(document.metadata->'payment'->>'paymentReference', '')) = :paymentReference`);
      params.paymentReference = normalizedReference;
    }
    if (normalizedExternalPaymentId) {
      clauses.push(`LOWER(COALESCE(document.metadata->'payment'->>'externalPaymentId', '')) = :externalPaymentId`);
      params.externalPaymentId = normalizedExternalPaymentId;
    }
    if (normalizedPaymentLinkId) {
      clauses.push(`LOWER(COALESCE(document.metadata->'payment'->>'paymentLinkId', '')) = :paymentLinkId`);
      params.paymentLinkId = normalizedPaymentLinkId;
    }
    if (clauses.length === 0) {
      return null;
    }
    query.andWhere(`(${clauses.join(' OR ')})`, params);
    query
      .orderBy('document.updatedAt', 'DESC')
      .addOrderBy('document.createdAt', 'DESC');

    return query.getOne();
  }

  private async findLatestPayfunnelDocumentByEmail(
    workspaceId: string,
    email?: string,
  ): Promise<Document | null> {
    const normalizedEmail = this.normalizeEmail(email);
    if (!normalizedEmail) {
      return null;
    }

    return this.documentRepository
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.contact', 'contact')
      .leftJoinAndSelect('document.deal', 'deal')
      .where('document.workspaceId = :workspaceId', { workspaceId })
      .andWhere(`LOWER(COALESCE(document.metadata->>'paymentSuppressed', 'false')) <> 'true'`)
      .andWhere(
        `(
          LOWER(COALESCE(contact.email, '')) = :email
          OR LOWER(COALESCE(document.metadata->'payment'->>'customerEmail', '')) = :email
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(document.recipients, '[]'::jsonb)) AS recipient
            WHERE LOWER(TRIM(COALESCE(recipient->>'email', ''))) = :email
          )
        )`,
        { email: normalizedEmail },
      )
      .orderBy(`CASE WHEN document.metadata ? 'payment' THEN 0 ELSE 1 END`, 'ASC')
      .addOrderBy('document.updatedAt', 'DESC')
      .addOrderBy('document.createdAt', 'DESC')
      .getOne();
  }

  private isPaymentSuppressedForDocument(document: Document): boolean {
    const metadata = (document.metadata || {}) as Record<string, any>;
    if (metadata?.paymentSuppressed === true) {
      return true;
    }
    return String(metadata?.paymentSuppressed || '').trim().toLowerCase() === 'true';
  }

  private extractHttpErrorMessage(error: any): string {
    const status = error?.response?.status;
    const data = error?.response?.data;
    const detail =
      this.getFirstNonEmpty(
        data?.message,
        data?.error?.message,
        data?.error,
        typeof data === 'string' ? data : undefined,
        error?.message,
      ) || 'Unknown error';

    if (status) {
      return `HTTP ${status}: ${detail}`;
    }
    return detail;
  }

  private resolveProviderBaseUrl(integration: Integration): string | undefined {
    const providerKey = String(integration.config?.provider || integration.externalId || '').trim().toLowerCase();
    const configured = this.getFirstNonEmpty(integration.config?.apiUrl, integration.config?.baseUrl);

    if (configured) {
      return configured;
    }
    if (providerKey === 'esemneaza') {
      return 'https://app.esemneaza.ro';
    }
    return undefined;
  }

  private buildProviderUrl(baseUrl: string, endpoint?: string): string {
    const normalizedBase = String(baseUrl || '').trim().replace(/\/+$/, '');
    const normalizedEndpoint = String(endpoint || '').trim();

    if (!normalizedEndpoint) {
      return normalizedBase;
    }
    if (/^https?:\/\//i.test(normalizedEndpoint)) {
      return normalizedEndpoint;
    }

    const endpointWithLeadingSlash = `/${normalizedEndpoint.replace(/^\/+/, '')}`;
    const baseEndsWithApiV1 = /\/api\/v1$/i.test(normalizedBase);
    const endpointStartsWithApiV1 = /^\/api\/v1(\/|$)/i.test(endpointWithLeadingSlash);
    if (baseEndsWithApiV1 && endpointStartsWithApiV1) {
      const suffix = endpointWithLeadingSlash.replace(/^\/api\/v1/i, '');
      return `${normalizedBase}${suffix}`;
    }

    return `${normalizedBase}${endpointWithLeadingSlash}`;
  }

  private buildUrlWithQueryParams(
    url: string,
    params: Record<string, string | number | undefined>,
  ): string {
    const query = Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');

    if (!query) {
      return url;
    }
    return `${url}${url.includes('?') ? '&' : '?'}${query}`;
  }

  private getPrimaryRecipient(document: Document): { email?: string; name?: string; phone?: string } {
    if (!Array.isArray(document.recipients) || document.recipients.length === 0) {
      return {
        email: document.contact?.email,
        name: document.contact?.fullName,
        phone: document.contact?.phone,
      };
    }
    const firstRecipient = document.recipients[0] as Record<string, any>;
    return {
      email: firstRecipient?.email,
      name: firstRecipient?.name,
      phone: this.getFirstNonEmpty(firstRecipient?.phone, document.contact?.phone),
    };
  }

  private resolvePaymentPayerName(document: Document, payload: any): string {
    return (
      this.getFirstNonEmpty(
        payload?.customerName,
        payload?.customer?.name,
        payload?.customer?.fullName,
        payload?.payerName,
        payload?.data?.customerName,
        payload?.data?.customer?.name,
        payload?.data?.customer?.fullName,
        document.contact?.fullName,
        this.getPrimaryRecipient(document)?.name,
        payload?.customerEmail,
        payload?.customer?.email,
        payload?.data?.customerEmail,
        this.getPrimaryRecipient(document)?.email,
      ) || 'Clientul'
    );
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

  private async notifyPaymentCompletedAudience(
    document: Document,
    payload: { title: string; message: string; link?: string },
  ): Promise<void> {
    const audienceIds = await this.getPaymentCompletionAudienceUserIds(
      document.workspaceId,
      document.createdById,
    );
    if (audienceIds.length === 0) {
      return;
    }

    await Promise.allSettled(
      audienceIds.map((userId) =>
        this.notificationsService.create(document.workspaceId, {
          type: NotificationType.SYSTEM,
          title: payload.title,
          message: payload.message,
          userId,
          link: payload.link || '/payments',
          metadata: {
            documentId: document.id,
            dealId: document.dealId,
            contactId: document.contactId,
            paymentStatus: 'paid',
          },
        }),
      ),
    );
  }

  private async getPaymentCompletionAudienceUserIds(
    workspaceId: string,
    primaryUserId?: string,
  ): Promise<string[]> {
    const leadershipRoles = [UserRole.CLOSER, UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN];
    const candidates = await this.userRepository
      .createQueryBuilder('user')
      .select(['user.id'])
      .where('user.workspaceId = :workspaceId', { workspaceId })
      .andWhere('user.status = :status', { status: UserStatus.ACTIVE })
      .andWhere('user.role IN (:...roles)', { roles: leadershipRoles })
      .getMany();

    const ids = new Set<string>(candidates.map((user) => String(user.id)));
    const normalizedPrimary = String(primaryUserId || '').trim();
    if (normalizedPrimary) {
      ids.add(normalizedPrimary);
    }
    return Array.from(ids);
  }

  private async notifyWorkspacePaymentTransaction(
    workspaceId: string,
    payload: {
      title: string;
      message: string;
      userId?: string;
      notifyLeadership?: boolean;
      metadata?: Record<string, any>;
    },
  ): Promise<void> {
    const normalizedUserId = String(payload.userId || '').trim();
    const recipients = new Set<string>();

    if (normalizedUserId) {
      const recipient = await this.userRepository.findOne({
        where: {
          id: normalizedUserId,
          workspaceId,
          status: UserStatus.ACTIVE,
        },
        select: ['id'],
      });
      if (recipient) {
        recipients.add(recipient.id);
      }
    }

    if (payload.notifyLeadership) {
      const leadershipIds = await this.getPaymentCompletionAudienceUserIds(workspaceId, normalizedUserId);
      leadershipIds.forEach((userId) => recipients.add(userId));
    }

    if (recipients.size === 0) {
      return;
    }

    await Promise.allSettled(
      Array.from(recipients).map((userId) =>
        this.notificationsService.create(workspaceId, {
          type: NotificationType.SYSTEM,
          title: payload.title,
          message: payload.message,
          userId,
          link: '/payments',
          metadata: payload.metadata,
        }),
      ),
    );
  }

  private async getStakeholderUserIds(document: Document): Promise<string[]> {
    const createdById = String(document.createdById || '').trim();
    if (!createdById) {
      return [];
    }

    const sender = await this.userRepository.findOne({
      where: {
        id: createdById,
        workspaceId: document.workspaceId,
        status: UserStatus.ACTIVE,
      },
      select: ['id'],
    });

    return sender ? [sender.id] : [];
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
    return ['paid', 'succeeded', 'success', 'completed', 'approved', 'captured', 'settled', 'confirmed'].some(
      (token) => status.includes(token) || eventName.includes(token),
    );
  }

  private isPaymentFailure(status: string, eventName: string): boolean {
    return ['failed', 'declined', 'insufficient', 'canceled', 'cancelled', 'error', 'rejected', 'refused', 'voided', 'chargeback'].some(
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
