import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, ILike } from 'typeorm';
import { Document, DocumentStatus, DocumentProvider } from '../database/entities/document.entity';
import { User } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';
import { Deal } from '../database/entities/deal.entity';
import { Integration, IntegrationType } from '../database/entities/integration.entity';
import { PandaDocIntegrationHandler } from '../integrations/handlers/pandadoc.handler';
import { DocuSignIntegrationHandler } from '../integrations/handlers/docusign.handler';

export interface DocumentsListResult {
  documents: Document[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
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
