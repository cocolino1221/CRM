import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { createHash } from 'crypto';
import { Integration, IntegrationType, IntegrationStatus, IntegrationAuthType } from '../../database/entities/integration.entity';
import { Contact } from '../../database/entities/contact.entity';
import { normalizePhoneE164 } from '../../common/utils/phone.util';

// Meta's Conversions API for CRM: reports pipeline stage changes back to
// Meta so the ad algorithm learns which ad audiences actually convert to
// real customers, not just cheap messages/clicks, and so Events Manager
// shows real funnel data instead of a bare lead count.
// https://www.facebook.com/business/help (CRM integration guide)
//
// Per-workspace, like every other integration — each customer connects
// their OWN dataset + access token (Settings -> Integrations), so
// workspace A's leads never report into workspace B's ad account.
const META_CAPI_VERSION = 'v26.0';

// Contacts created from a DM/webhook with no real email get a synthetic
// placeholder so the entity's NOT NULL constraint is satisfied — never a
// real match key, so never send it to Meta.
const PLACEHOLDER_EMAIL_SUFFIXES = [
  '@whatsapp.placeholder.invalid',
  '@meta.placeholder.invalid',
  '@meta.leadads.placeholder.invalid',
  '@sheet.placeholder.invalid',
];

export interface MetaCapiConfig {
  datasetId: string;
  enabled: boolean;
  hasAccessToken: boolean;
  lastEventAt?: string;
  lastError?: string;
}

@Injectable()
export class MetaConversionsService {
  private readonly logger = new Logger(MetaConversionsService.name);

  constructor(
    @InjectRepository(Integration) private readonly integrationRepository: Repository<Integration>,
    private readonly httpService: HttpService,
  ) {}

  private async getIntegration(workspaceId: string): Promise<Integration | null> {
    return this.integrationRepository.findOne({
      where: { workspaceId, type: IntegrationType.META_CAPI },
    });
  }

  async getConfig(workspaceId: string): Promise<MetaCapiConfig | null> {
    const integration = await this.getIntegration(workspaceId);
    if (!integration) return null;
    return {
      datasetId: String(integration.config?.datasetId || ''),
      enabled: integration.status === IntegrationStatus.ACTIVE,
      hasAccessToken: !!integration.credentials?.accessToken,
      lastEventAt: integration.lastSync?.timestamp ? new Date(integration.lastSync.timestamp).toISOString() : undefined,
      lastError: integration.lastSync?.status === 'error' ? (integration.lastSync as any)?.error : undefined,
    };
  }

  async saveConfig(
    workspaceId: string,
    userId: string,
    dto: { datasetId: string; accessToken?: string; enabled?: boolean },
  ): Promise<MetaCapiConfig> {
    if (!dto.datasetId?.trim()) {
      throw new BadRequestException('datasetId is required');
    }
    let integration = await this.getIntegration(workspaceId);
    if (!integration) {
      if (!dto.accessToken?.trim()) {
        throw new BadRequestException('accessToken is required to connect Meta Conversions API');
      }
      integration = this.integrationRepository.create({
        workspaceId,
        userId,
        type: IntegrationType.META_CAPI,
        authType: IntegrationAuthType.API_KEY,
        name: 'Meta Conversions API',
        status: IntegrationStatus.ACTIVE,
      });
    }

    integration.config = { ...(integration.config as any), datasetId: dto.datasetId.trim() };
    if (dto.accessToken?.trim()) {
      // Meta system-user tokens are ~200+ chars and routinely pick up stray
      // whitespace/newlines on copy-paste (line-wrapping, etc.), which makes
      // Graph reject them with an auth error ("Bad signature" / "Cannot
      // parse access token"). Strip ALL whitespace, not just leading/trailing.
      const cleanToken = dto.accessToken.replace(/\s+/g, '');
      integration.credentials = { ...(integration.credentials as any), accessToken: cleanToken };
    }
    if (dto.enabled !== undefined) {
      integration.status = dto.enabled ? IntegrationStatus.ACTIVE : IntegrationStatus.DISABLED;
    }

    await this.integrationRepository.save(integration);
    return this.getConfig(workspaceId) as Promise<MetaCapiConfig>;
  }

  async disconnect(workspaceId: string): Promise<void> {
    const integration = await this.getIntegration(workspaceId);
    if (!integration) return;
    await this.integrationRepository.remove(integration);
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private isRealEmail(email?: string | null): email is string {
    if (!email) return false;
    const lower = email.trim().toLowerCase();
    return !!lower && !PLACEHOLDER_EMAIL_SUFFIXES.some((suffix) => lower.endsWith(suffix));
  }

  private buildUserData(contact: Pick<Contact, 'email' | 'phone' | 'customFields'>): Record<string, any> | null {
    const userData: Record<string, any> = {};

    // Highest-priority match key: Meta's own lead_id, present when this
    // contact came from a native Meta Lead Ads form (see meta-leads.service).
    const leadgenId = (contact.customFields as any)?.metaLeadgenId;
    if (leadgenId) userData.lead_id = String(leadgenId);

    if (this.isRealEmail(contact.email)) {
      userData.em = [this.hash(contact.email.trim().toLowerCase())];
    }

    const normalizedPhone = normalizePhoneE164(contact.phone);
    if (normalizedPhone) {
      userData.ph = [this.hash(normalizedPhone.replace(/^\+/, ''))];
    }

    return userData.lead_id || userData.em || userData.ph ? userData : null;
  }

  private async postEvent(integration: Integration, event: Record<string, any>, testEventCode?: string): Promise<void> {
    const datasetId = integration.config?.datasetId;
    const accessToken = integration.credentials?.accessToken;
    if (!datasetId || !accessToken) return;

    const body: Record<string, any> = { data: [event], access_token: accessToken };
    if (testEventCode) body.test_event_code = testEventCode;

    try {
      await this.httpService.axiosRef.post(`https://graph.facebook.com/${META_CAPI_VERSION}/${datasetId}/events`, body);
      integration.lastSync = { timestamp: new Date(), status: 'success' } as any;
      await this.integrationRepository.save(integration);
    } catch (error: any) {
      const message = error?.response?.data?.error?.message || error?.message || 'unknown error';
      integration.lastSync = { timestamp: new Date(), status: 'error', error: message } as any;
      await this.integrationRepository.save(integration);
      throw new Error(message);
    }
  }

  /**
   * Reports a pipeline stage change for one contact, using that contact's
   * OWN workspace's connected dataset. Best-effort and fire-and-forget from
   * the caller's perspective — never throws, so a failure here (not
   * connected, disabled, Meta API error, no usable match key) can never
   * block the actual stage change it's reporting on.
   */
  async reportStageChange(contact: Contact, stageName: string): Promise<void> {
    if (!stageName?.trim()) return;
    const integration = await this.getIntegration(contact.workspaceId);
    if (!integration || integration.status !== IntegrationStatus.ACTIVE) return;

    const userData = this.buildUserData(contact);
    // Nothing for Meta to match this event against — sending it would just
    // be a silently-ignored no-op on their end, so don't bother.
    if (!userData) return;

    const event = {
      event_name: stageName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'system_generated',
      custom_data: { event_source: 'crm', lead_event_source: 'EasyTeamCRM' },
      user_data: userData,
    };

    try {
      await this.postEvent(integration, event);
      this.logger.log(`[meta-capi] sent stage event "${stageName}" for contact ${contact.id} ws=${contact.workspaceId}`);
    } catch (error: any) {
      this.logger.warn(`[meta-capi] failed to send stage event "${stageName}" for contact ${contact.id}: ${error.message}`);
    }
  }

  /**
   * Sends a synthetic test event so the user can confirm their dataset +
   * token work before relying on real stage changes — mirrors step 4
   * ("Testează evenimentul") of Meta's own CRM integration guide.
   */
  async sendTestEvent(workspaceId: string, testEventCode?: string): Promise<{ success: boolean }> {
    const integration = await this.getIntegration(workspaceId);
    if (!integration) {
      throw new NotFoundException('Connect Meta Conversions API first');
    }

    const event = {
      event_name: 'Test Event',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'system_generated',
      custom_data: { event_source: 'crm', lead_event_source: 'EasyTeamCRM' },
      user_data: {
        em: [this.hash('test@example.com')],
        ph: [this.hash('15555550100')],
      },
    };

    try {
      await this.postEvent(integration, event, testEventCode);
    } catch (error: any) {
      // postEvent throws a plain Error — let it surface as a real 400 with
      // Meta's actual message (e.g. "Bad signature" from a corrupted token)
      // instead of the generic "unexpected error" a raw Error becomes.
      throw new BadRequestException(error.message);
    }
    return { success: true };
  }
}
