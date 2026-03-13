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
import FormData from 'form-data';
import { Document, DocumentStatus, DocumentProvider, DocumentType } from '../database/entities/document.entity';
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

    const apiUrl = this.getFirstNonEmpty(integration.config?.apiUrl, integration.config?.baseUrl);
    if (apiUrl) {
      const endpoint = String(integration.config?.listPaymentLinksPath || '/payments/links');
      try {
        const response = await this.httpService.axiosRef.get(
          this.buildProviderUrl(apiUrl, endpoint),
          {
            headers: this.buildProviderHeaders(integration),
          },
        );

        const rows = this.extractApiRows(response.data, ['links', 'items', 'results', 'data']);
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

    const manualPaymentLinkUrl = this.getFirstNonEmpty(
      options?.paymentLinkUrl,
      paymentData.preferredLinkUrl,
    );
    const manualPaymentLinkName = this.getFirstNonEmpty(
      options?.paymentLinkName,
      paymentData.preferredLinkName,
    );

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
    }

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
        ...(manualPaymentLinkName ? { preferredLinkName: manualPaymentLinkName } : {}),
        ...(manualPaymentLinkUrl ? { preferredLinkUrl: manualPaymentLinkUrl } : {}),
        paymentReference,
        externalPaymentId: paymentLink.externalPaymentId,
        updatedAt: new Date(),
      },
    };
    document.addAuditEntry(manualPaymentLinkUrl ? 'payfunnels.link_selected' : 'payfunnels.link_created', userId, {
      amount,
      currency,
      paymentReference,
      externalPaymentId: paymentLink.externalPaymentId,
      paymentLinkUrl: paymentLink.url,
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

  private extractApiRows(payload: any, keys: string[]): any[] {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;

    for (const key of keys) {
      const value = payload?.[key];
      if (Array.isArray(value)) return value;
      if (value && typeof value === 'object') {
        if (Array.isArray(value.items)) return value.items;
        if (Array.isArray(value.results)) return value.results;
        if (Array.isArray(value.data)) return value.data;
      }
    }

    if (Array.isArray(payload?.data)) return payload.data;
    if (payload?.data && typeof payload.data === 'object') {
      if (Array.isArray(payload.data.items)) return payload.data.items;
      if (Array.isArray(payload.data.results)) return payload.data.results;
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

      const providerKey = String(integration.config?.provider || integration.externalId || '').toLowerCase();
      if (providerKey === 'esemneaza') {
        headers['X-API-Key'] = headers['X-API-Key'] || apiKey;
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
