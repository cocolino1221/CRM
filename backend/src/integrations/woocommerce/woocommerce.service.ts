import { BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHmac, timingSafeEqual } from 'crypto';
import { Integration, IntegrationStatus, IntegrationType } from '../../database/entities/integration.entity';
import { Contact, ContactSource, ContactStatus } from '../../database/entities/contact.entity';
import { ContactsService } from '../../contacts/contacts.service';
import { normalizePhoneE164 } from '../../common/utils/phone.util';

// WooCommerce is stored as a generic `type: api` integration with
// config.provider = 'woocommerce' (that's what the Integrations page's
// generic connect form creates): config.storeUrl, config.triggerOn,
// config.webhookSecret, credentials.consumerKey / consumerSecret.

// Order statuses that mean the customer actually committed (paid, or chose
// cash-on-delivery / bank transfer). Pending/failed checkouts are skipped by
// default so abandoned carts don't get WhatsApp messages.
const CONFIRMED_STATUSES = new Set(['processing', 'completed', 'on-hold']);
const NEVER_PROCESS_STATUSES = new Set(['failed', 'cancelled', 'refunded', 'trash', 'checkout-draft']);
const ORDER_TOPICS = new Set(['order.created', 'order.updated']);

export interface WooLineItem {
  productId: string;
  variationId?: string;
  name: string;
  sku?: string;
  quantity: number;
  total?: string;
}

@Injectable()
export class WooCommerceService {
  private readonly logger = new Logger(WooCommerceService.name);
  // order.created and order.updated for the same order usually arrive within
  // milliseconds of each other — this catches the race before the DB-level
  // dedupe (customFields.wooOrderKeys) has been written.
  private readonly recentOrderKeys = new Map<string, number>();

  constructor(
    @InjectRepository(Integration) private readonly integrationRepository: Repository<Integration>,
    @InjectRepository(Contact) private readonly contactRepository: Repository<Contact>,
    private readonly contactsService: ContactsService,
    private readonly eventEmitter: EventEmitter2,
    private readonly httpService: HttpService,
  ) {}

  private isWooIntegration(integration: Integration | null): integration is Integration {
    if (!integration) return false;
    const provider = String(integration.config?.provider || integration.externalId || '').toLowerCase();
    return integration.type === IntegrationType.API && provider === 'woocommerce';
  }

  async getIntegration(integrationId: string, workspaceId?: string): Promise<Integration> {
    const integration = await this.integrationRepository.findOne({
      where: workspaceId ? { id: integrationId, workspaceId } : { id: integrationId },
    });
    if (!this.isWooIntegration(integration)) throw new NotFoundException('WooCommerce integration not found');
    return integration;
  }

  // ── webhook ──

  verifySignature(integration: Integration, rawBody: Buffer | undefined, signature: string | undefined): void {
    // The generic Integrations connect form stores webhookSecret in config
    // (same as every other webhook-secret integration there); accept either.
    const secret = String(integration.credentials?.webhookSecret || integration.config?.webhookSecret || '').trim();
    if (!secret) {
      throw new UnauthorizedException('Webhook secret not configured for this WooCommerce integration');
    }
    if (!rawBody || !signature) {
      throw new UnauthorizedException('Missing webhook signature');
    }
    const expected = createHmac('sha256', secret).update(rawBody).digest('base64');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(signature).trim());
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
  }

  async handleWebhook(integration: Integration, topic: string | undefined, order: any): Promise<{ processed: boolean; reason?: string }> {
    if (!topic || !ORDER_TOPICS.has(topic) || !order?.id) {
      // WooCommerce sends a form-encoded "webhook_id=N" ping on creation, and
      // other topics may be subscribed by mistake — acknowledge and ignore.
      return { processed: false, reason: 'not an order event' };
    }

    const status = String(order.status || '').toLowerCase();
    const triggerOn = String(integration.config?.triggerOn || 'confirmed');
    if (NEVER_PROCESS_STATUSES.has(status)) return { processed: false, reason: `status ${status}` };
    if (triggerOn !== 'any' && !CONFIRMED_STATUSES.has(status)) {
      return { processed: false, reason: `status ${status} not confirmed yet` };
    }

    // Order IDs are only unique per store, and a workspace can connect several.
    const orderKey = `${integration.id}:${order.id}`;
    if (!this.markOrderSeen(orderKey)) return { processed: false, reason: 'duplicate delivery' };
    if (await this.orderAlreadyProcessed(integration.workspaceId, orderKey)) {
      return { processed: false, reason: 'order already processed' };
    }

    await this.processOrder(integration, order, orderKey);
    return { processed: true };
  }

  private markOrderSeen(key: string): boolean {
    const now = Date.now();
    for (const [k, t] of this.recentOrderKeys) if (now - t > 10 * 60 * 1000) this.recentOrderKeys.delete(k);
    if (this.recentOrderKeys.has(key)) return false;
    this.recentOrderKeys.set(key, now);
    return true;
  }

  private async orderAlreadyProcessed(workspaceId: string, orderKey: string): Promise<boolean> {
    const count = await this.contactRepository
      .createQueryBuilder('c')
      .where('c.workspaceId = :workspaceId', { workspaceId })
      .andWhere(`c."customFields" -> 'wooOrderKeys' @> :key::jsonb`, { key: JSON.stringify([orderKey]) })
      .getCount();
    return count > 0;
  }

  private parseLineItems(order: any): WooLineItem[] {
    return (Array.isArray(order.line_items) ? order.line_items : []).map((item: any) => ({
      productId: String(item.product_id ?? ''),
      variationId: item.variation_id ? String(item.variation_id) : undefined,
      name: String(item.name || '').trim(),
      sku: String(item.sku || '').trim() || undefined,
      quantity: Number(item.quantity) || 1,
      total: item.total != null ? String(item.total) : undefined,
    }));
  }

  private async processOrder(integration: Integration, order: any, orderKey: string): Promise<void> {
    const workspaceId = integration.workspaceId;
    const billing = order.billing || {};
    const shipping = order.shipping || {};
    const email = String(billing.email || '').trim().toLowerCase();
    const rawPhone = String(billing.phone || shipping.phone || '').trim();
    const phoneNormalized = normalizePhoneE164(rawPhone);
    const firstName = String(billing.first_name || shipping.first_name || '').trim();
    const lastName = String(billing.last_name || shipping.last_name || '').trim();
    const lineItems = this.parseLineItems(order);

    const wooOrder = {
      orderKey,
      orderId: String(order.id),
      orderNumber: String(order.number || order.id),
      status: String(order.status || ''),
      total: String(order.total || ''),
      currency: String(order.currency || ''),
      paymentMethod: String(order.payment_method_title || order.payment_method || ''),
      createdAt: String(order.date_created_gmt || order.date_created || new Date().toISOString()),
      city: String(billing.city || shipping.city || ''),
      lineItems,
    };

    const existing = await this.findExistingContact(workspaceId, email, phoneNormalized);

    if (existing) {
      const custom = { ...((existing.customFields as any) || {}) };
      custom.wooOrder = wooOrder;
      custom.wooOrderKeys = [...(Array.isArray(custom.wooOrderKeys) ? custom.wooOrderKeys : []), orderKey];
      custom.wooProductsPurchased = this.mergeProducts(custom.wooProductsPurchased, lineItems);
      existing.customFields = custom;
      if (!existing.phone && rawPhone) {
        existing.phone = rawPhone;
        existing.phoneNormalized = phoneNormalized || undefined;
      }
      existing.tags = Array.from(new Set([...(existing.tags || []), 'woocommerce']));
      const saved = await this.contactRepository.save(existing);

      // Repeat customer: reuse the same event the WhatsApp auto-send engine
      // already listens to for webhook-sourced duplicates, so a product rule
      // fires for their NEW order too. customFields.wooOrder is the latest
      // order, which is what the product condition matches against.
      this.eventEmitter.emit('contact.external_duplicate', {
        contact: saved,
        workspaceId,
        source: ContactSource.WOOCOMMERCE,
        occurredAt: new Date().toISOString(),
      });
      this.logger.log(`[woocommerce] order ${orderKey} → existing contact ${saved.id}`);
      return;
    }

    const fallbackName = email ? email.split('@')[0] : rawPhone || `Order ${wooOrder.orderNumber}`;
    const contact = await this.contactsService.create(workspaceId, {
      firstName: firstName || fallbackName,
      lastName: lastName || '-',
      email: email || `order_${integration.id.slice(0, 8)}_${order.id}@woocommerce.placeholder.invalid`,
      phone: rawPhone || undefined,
      status: ContactStatus.LEAD,
      source: ContactSource.WOOCOMMERCE,
      ownerId: integration.userId || undefined,
      pipelineId: integration.config?.pipelineId || undefined,
      pipelineStageId: integration.config?.pipelineStageId || undefined,
      tags: ['woocommerce'],
      notes: `WooCommerce order #${wooOrder.orderNumber}: ${lineItems.map((i) => `${i.quantity}× ${i.name}`).join(', ')}`,
      customFields: {
        wooOrder,
        wooOrderKeys: [orderKey],
        wooProductsPurchased: this.mergeProducts([], lineItems),
      },
    } as any);
    // ContactsService.create emits contact.created → WhatsApp auto-send rules.
    this.logger.log(`[woocommerce] order ${orderKey} → new contact ${contact.id}`);
  }

  private mergeProducts(existing: any, items: WooLineItem[]): Array<{ productId: string; name: string; sku?: string }> {
    const list: Array<{ productId: string; name: string; sku?: string }> = Array.isArray(existing) ? [...existing] : [];
    for (const item of items) {
      if (!list.some((p) => p.productId === item.productId)) {
        list.push({ productId: item.productId, name: item.name, sku: item.sku });
      }
    }
    return list;
  }

  private async findExistingContact(workspaceId: string, email: string, phoneNormalized: string | null): Promise<Contact | null> {
    if (phoneNormalized) {
      const byPhone = await this.contactRepository.findOne({ where: { workspaceId, phoneNormalized } });
      if (byPhone) return byPhone;
    }
    if (email) {
      return this.contactRepository.findOne({ where: { workspaceId, email } });
    }
    return null;
  }

  // ── store API helpers ──

  private storeApi(integration: Integration) {
    const storeUrl = String(integration.config?.storeUrl || '').trim().replace(/\/+$/, '');
    const username = String(integration.credentials?.consumerKey || '').trim();
    const password = String(integration.credentials?.consumerSecret || '').trim();
    if (!storeUrl || !username || !password) {
      throw new BadRequestException('Store URL, Consumer Key and Consumer Secret are required');
    }
    const base = `${storeUrl}/wp-json/wc/v3`;
    const request = (method: 'get' | 'post' | 'put', path: string, data?: any) =>
      this.httpService.axiosRef.request({ method, url: `${base}/${path}`, data, auth: { username, password }, timeout: 15000 });
    return { request };
  }

  webhookUrl(integration: Integration): string {
    // APP_URL is set with the /api/v1 suffix in production — normalize so it isn't doubled.
    const appUrl = String(process.env.APP_URL || 'https://slackcrm-backend.fly.dev').replace(/\/+$/, '').replace(/\/api\/v1$/, '');
    return `${appUrl}/api/v1/integrations/woocommerce/webhook/${integration.id}`;
  }

  /**
   * Creates (or repairs) the order.created + order.updated webhooks in the
   * store itself, so users don't have to do the WordPress step by hand —
   * the step most likely to be skipped (seen in production: integration
   * connected, zero webhooks in the store, zero orders ever received).
   * Idempotent: an existing webhook with our URL + topic is re-enabled and
   * its secret re-synced instead of duplicated. Needs a Read/Write API key.
   */
  async setupWebhooks(integration: Integration): Promise<{ ok: boolean; webhookUrl: string; webhooks: any[]; error?: string }> {
    const secret = String(integration.credentials?.webhookSecret || integration.config?.webhookSecret || '').trim();
    const deliveryUrl = this.webhookUrl(integration);
    const result: { ok: boolean; webhookUrl: string; webhooks: any[]; error?: string } = { ok: false, webhookUrl: deliveryUrl, webhooks: [] };

    try {
      if (!secret) throw new BadRequestException('Set a Webhook Secret on the integration first');
      const { request } = this.storeApi(integration);
      const existing = (await request('get', 'webhooks?per_page=100')).data;
      const hooks: any[] = Array.isArray(existing) ? existing : [];

      for (const topic of ['order.created', 'order.updated']) {
        const match = hooks.find((h) => h.topic === topic && String(h.delivery_url || '').replace(/\/+$/, '') === deliveryUrl);
        const payload = {
          name: `EasyTeam CRM – ${topic === 'order.created' ? 'Order created' : 'Order updated'}`,
          topic,
          delivery_url: deliveryUrl,
          secret,
          status: 'active',
          api_version: 'wp_api_v3',
        };
        const saved = match
          ? (await request('put', `webhooks/${match.id}`, payload)).data
          : (await request('post', 'webhooks', payload)).data;
        result.webhooks.push({ id: saved?.id, topic: saved?.topic, status: saved?.status });
      }
      result.ok = true;
    } catch (error: any) {
      const status = error?.response?.status;
      result.error =
        status === 401 || status === 403
          ? 'Your WooCommerce API key can read but not create webhooks. Edit the key in WooCommerce → Settings → Advanced → REST API and set Permissions to "Read/Write", then click Connect again — or create the two webhooks manually.'
          : status === 404
            ? 'WooCommerce REST API not found at this Store URL — check the address (no /wp-admin) and that permalinks are not set to "Plain".'
            : error?.response?.data?.message || error?.message || 'Could not reach the store';
    }

    integration.config = {
      ...(integration.config as any),
      webhookSetup: { ok: result.ok, at: new Date().toISOString(), webhooks: result.webhooks, error: result.error },
    };
    if (result.ok) integration.status = IntegrationStatus.ACTIVE;
    await this.integrationRepository.save(integration);
    this.logger.log(`[woocommerce] webhook setup for ${integration.id}: ${result.ok ? 'ok' : result.error}`);
    return result;
  }

  // ── product picker (for auto-send product rules) ──

  async listProducts(integration: Integration, search?: string): Promise<Array<{ id: string; name: string; sku?: string }>> {
    const storeUrl = String(integration.config?.storeUrl || '').trim().replace(/\/+$/, '');
    const key = String(integration.credentials?.consumerKey || '').trim();
    const secret = String(integration.credentials?.consumerSecret || '').trim();
    if (!storeUrl || !key || !secret) {
      throw new BadRequestException('Store URL, Consumer Key and Consumer Secret are required to list products');
    }
    try {
      const response = await this.httpService.axiosRef.get(`${storeUrl}/wp-json/wc/v3/products`, {
        params: { per_page: 50, search: search || undefined, status: 'publish' },
        auth: { username: key, password: secret },
        timeout: 15000,
      });
      const rows = Array.isArray(response.data) ? response.data : [];
      return rows.map((p: any) => ({ id: String(p.id), name: String(p.name || ''), sku: p.sku ? String(p.sku) : undefined }));
    } catch (error: any) {
      const status = error?.response?.status;
      const message = error?.response?.data?.message || error?.message || 'unknown error';
      throw new BadRequestException(`WooCommerce API error${status ? ` (${status})` : ''}: ${message}`);
    }
  }
}
