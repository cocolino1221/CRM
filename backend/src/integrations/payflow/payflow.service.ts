import { BadRequestException, Injectable, Logger, NotFoundException, Optional, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { Integration, IntegrationAuthType, IntegrationStatus, IntegrationType } from '../../database/entities/integration.entity';
import { Contact, ContactSource, ContactStatus } from '../../database/entities/contact.entity';
import { Deal, DealSource, DealStage } from '../../database/entities/deal.entity';
import { Pipeline } from '../../database/entities/pipeline.entity';
import { ContactsService } from '../../contacts/contacts.service';
import { DealsService } from '../../deals/deals.service';
import { PayflowSyncDto } from './payflow-sync.dto';
import { BillingService } from '../../billing/billing.service';

// Payflow is our own payments app. It pushes customers and payments into the
// CRM; the CRM issues one connection key the user pastes into Payflow.
export const PAYFLOW_PROVIDER = 'gopayflow';
const KEY_PREFIX = 'etcrm_';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

@Injectable()
export class PayflowService {
  private readonly logger = new Logger(PayflowService.name);

  constructor(
    @InjectRepository(Integration) private readonly integrationRepository: Repository<Integration>,
    @InjectRepository(Contact) private readonly contactRepository: Repository<Contact>,
    @InjectRepository(Deal) private readonly dealRepository: Repository<Deal>,
    @InjectRepository(Pipeline) private readonly pipelineRepository: Repository<Pipeline>,
    private readonly contactsService: ContactsService,
    private readonly dealsService: DealsService,
    @Optional() private readonly billingService?: BillingService,
  ) {}

  private findWorkspaceIntegration(workspaceId: string): Promise<Integration | null> {
    return this.integrationRepository.findOne({
      where: { workspaceId, type: IntegrationType.API, externalId: PAYFLOW_PROVIDER },
      order: { createdAt: 'DESC' },
    });
  }

  /** Create (or rotate) the workspace's Payflow connection key. The key is shown once. */
  async connect(workspaceId: string, userId: string): Promise<{ key: string; integrationId: string }> {
    await this.billingService?.assertIntegrationAllowed(workspaceId, PAYFLOW_PROVIDER);
    let integration = await this.findWorkspaceIntegration(workspaceId);
    if (!integration) {
      integration = this.integrationRepository.create({
        workspaceId,
        userId,
        type: IntegrationType.API,
        externalId: PAYFLOW_PROVIDER,
        name: 'Payflow',
        authType: IntegrationAuthType.API_KEY,
        config: { provider: PAYFLOW_PROVIDER },
        credentials: {},
      } as Partial<Integration>);
      integration = await this.integrationRepository.save(integration);
    }

    const secret = randomBytes(24).toString('hex');
    const key = `${KEY_PREFIX}${integration.id}_${secret}`;
    integration.config = {
      ...(integration.config || {}),
      provider: PAYFLOW_PROVIDER,
      payflowKeyHash: sha256(secret),
      payflowKeyPrefix: key.slice(0, 14),
      payflowKeyCreatedAt: new Date().toISOString(),
    };
    integration.userId = integration.userId || userId;
    integration.status = IntegrationStatus.ACTIVE;
    await this.integrationRepository.save(integration);
    this.logger.log(`[payflow] connection key issued for workspace ${workspaceId}`);
    return { key, integrationId: integration.id };
  }

  async status(workspaceId: string) {
    const integration = await this.findWorkspaceIntegration(workspaceId);
    const cfg = integration?.config || {};
    return {
      connected: !!cfg.payflowKeyHash,
      integrationId: integration?.id || null,
      keyPrefix: cfg.payflowKeyPrefix || null,
      keyCreatedAt: cfg.payflowKeyCreatedAt || null,
      lastSyncAt: cfg.payflowLastSyncAt || null,
    };
  }

  /** Resolve the integration from `Authorization: Bearer etcrm_<integrationId>_<secret>`. */
  async authenticate(authorization: string | undefined): Promise<Integration> {
    const token = String(authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token.startsWith(KEY_PREFIX)) throw new UnauthorizedException('Missing or invalid CRM connection key');
    const body = token.slice(KEY_PREFIX.length);
    const sep = body.lastIndexOf('_');
    const integrationId = body.slice(0, sep);
    const secret = body.slice(sep + 1);
    if (sep < 0 || !UUID_RE.test(integrationId) || !secret) {
      throw new UnauthorizedException('Missing or invalid CRM connection key');
    }

    const integration = await this.integrationRepository.findOne({
      where: { id: integrationId, type: IntegrationType.API, externalId: PAYFLOW_PROVIDER },
    });
    const expected = String(integration?.config?.payflowKeyHash || '');
    const actual = sha256(secret);
    if (!integration || expected.length !== actual.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))) {
      throw new UnauthorizedException('Missing or invalid CRM connection key');
    }
    if (integration.status === IntegrationStatus.DISABLED) {
      throw new UnauthorizedException('The Payflow connection is disabled in the CRM');
    }
    return integration;
  }

  async listPipelines(workspaceId: string) {
    const pipelines = await this.pipelineRepository.find({
      where: { workspaceId },
      relations: ['stages'],
      order: { createdAt: 'ASC' },
    });
    return pipelines.map((p: any) => ({
      id: p.id,
      name: p.name,
      isDefault: !!p.isDefault,
      stages: [...(p.stages || [])]
        .sort((a: any, b: any) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((s: any) => ({ id: s.id, name: s.name })),
    }));
  }

  /** Upsert the customer as a contact and record the payment as a deal (idempotent per transaction). */
  async sync(integration: Integration, dto: PayflowSyncDto) {
    const workspaceId = integration.workspaceId;
    const email = String(dto.customer?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) throw new BadRequestException('customer.email is required');

    const pipelineId = dto.pipelineId || undefined;
    const pipelineStageId = dto.pipelineStageId || undefined;
    if (pipelineId) await this.assertPipeline(workspaceId, pipelineId, pipelineStageId);

    let contact = await this.findContact(workspaceId, email, dto.customer.phone);
    let contactCreated = false;
    if (!contact) {
      const [firstName, ...rest] = String(dto.customer.name || email.split('@')[0]).trim().split(/\s+/);
      const created = await this.contactsService.create(workspaceId, {
        firstName: firstName || email.split('@')[0],
        lastName: rest.join(' ') || '-',
        email,
        phone: dto.customer.phone || undefined,
        status: dto.status === 'lost' ? ContactStatus.LEAD : ContactStatus.CUSTOMER,
        source: ContactSource.PAYFLOW,
        ownerId: integration.userId || undefined,
        pipelineId,
        pipelineStageId,
        tags: ['payflow'],
        customFields: { payflowCustomerId: dto.customer.id || undefined },
      } as any);
      contact = created as Contact;
      contactCreated = true;
    } else if (pipelineStageId && contact.pipelineStageId !== pipelineStageId) {
      // Goes through ContactsService so stage-change automations still fire.
      await this.contactsService.update(workspaceId, contact.id, { pipelineId, pipelineStageId } as any);
    }

    let dealId: string | null = null;
    if (dto.amount != null && dto.transactionId) {
      const existing = await this.dealRepository
        .createQueryBuilder('d')
        .where('d.workspaceId = :workspaceId', { workspaceId })
        .andWhere(`d."customFields" ->> 'payflowTransactionId' = :tx`, { tx: dto.transactionId })
        .getOne();
      if (existing) {
        dealId = existing.id;
      } else {
        const won = dto.status !== 'lost';
        const deal: any = await this.dealsService.create(workspaceId, {
          title: dto.title || 'Payflow payment',
          value: Number(dto.amount) || 0,
          currency: String(dto.currency || 'EUR').toUpperCase().slice(0, 3),
          stage: won ? DealStage.CLOSED_WON : DealStage.CLOSED_LOST,
          probability: won ? 100 : 0,
          source: DealSource.OTHER,
          contactId: contact!.id,
          ownerId: integration.userId || undefined,
          actualCloseDate: new Date(),
          lossReason: won ? undefined : 'Payment failed or subscription cancelled (Payflow)',
          customFields: { payflowTransactionId: dto.transactionId, source: 'payflow' },
        } as any);
        dealId = deal?.id || null;
      }
    }

    // A lead who pays becomes a customer and moves to the won stage of their
    // own pipeline, so the board agrees with Win — unless Payflow named a stage.
    if (!contactCreated && dto.status !== 'lost' && dto.amount != null) {
      await this.promoteToWon(workspaceId, contact!, Boolean(pipelineStageId));
    }

    integration.config = { ...(integration.config || {}), payflowLastSyncAt: new Date().toISOString() };
    await this.integrationRepository.save(integration);
    this.logger.log(`[payflow] synced ${email} → contact ${contact!.id}${dealId ? `, deal ${dealId}` : ''}`);
    return { ok: true, contactId: contact!.id, contactCreated, dealId };
  }

  /**
   * The lead a payment belongs to: same email in any case, else the same
   * phone however it was typed (last nine digits). A payer is almost always
   * someone who came in through a form or the shop first.
   */
  private async findContact(workspaceId: string, email: string, phone?: string): Promise<Contact | null> {
    const byEmail = await this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.workspaceId = :workspaceId', { workspaceId })
      .andWhere('contact.deletedAt IS NULL')
      .andWhere('LOWER(contact.email) = :email', { email })
      .orderBy('contact.createdAt', 'ASC')
      .getOne();
    if (byEmail) return byEmail;

    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 9) return null;
    return this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.workspaceId = :workspaceId', { workspaceId })
      .andWhere('contact.deletedAt IS NULL')
      .andWhere(`regexp_replace(contact.phone, '\\D', '', 'g') LIKE :tail`, { tail: `%${digits.slice(-9)}` })
      .orderBy('contact.createdAt', 'ASC')
      .getOne();
  }

  private async promoteToWon(workspaceId: string, contact: Contact, stageGiven: boolean): Promise<void> {
    try {
      const change: Record<string, any> = {};
      if (contact.status !== ContactStatus.CUSTOMER) change.status = ContactStatus.CUSTOMER;
      if (!stageGiven && contact.pipelineId) {
        const pipeline: any = await this.pipelineRepository.findOne({
          where: { id: contact.pipelineId, workspaceId },
          relations: ['stages'],
        });
        const won = (pipeline?.stages ?? []).find((s: any) => s.isClosedWon && !s.deletedAt);
        if (won && won.id !== contact.pipelineStageId) change.pipelineStageId = won.id;
      }
      // Through ContactsService so stage-change automations still fire.
      if (Object.keys(change).length) await this.contactsService.update(workspaceId, contact.id, change as any);
    } catch (error: any) {
      // The payment is recorded already; a failed move must not lose it.
      this.logger.warn(`[payflow] could not move contact ${contact.id} to won: ${error?.message}`);
    }
  }

  private async assertPipeline(workspaceId: string, pipelineId: string, stageId?: string) {
    const pipeline: any = await this.pipelineRepository.findOne({ where: { id: pipelineId, workspaceId }, relations: ['stages'] });
    if (!pipeline) throw new NotFoundException('Pipeline not found in this CRM workspace');
    if (stageId && !(pipeline.stages || []).some((s: any) => s.id === stageId)) {
      throw new NotFoundException('Pipeline stage not found in this pipeline');
    }
  }
}
