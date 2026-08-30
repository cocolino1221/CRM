import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { createHash } from 'crypto';
import { Contact } from '../../database/entities/contact.entity';
import { normalizePhoneE164 } from '../../common/utils/phone.util';

// Meta's Conversions API for CRM: reports pipeline stage changes back to
// Meta so the ad algorithm learns which ad audiences actually convert to
// real customers, not just cheap messages/clicks, and so Events Manager
// shows real funnel data instead of a bare lead count.
// https://www.facebook.com/business/help (CRM integration guide)
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

@Injectable()
export class MetaConversionsService {
  private readonly logger = new Logger(MetaConversionsService.name);
  private readonly datasetId = process.env.META_CAPI_DATASET_ID;
  private readonly accessToken = process.env.META_CAPI_ACCESS_TOKEN;

  constructor(private readonly httpService: HttpService) {}

  get isEnabled(): boolean {
    return !!this.datasetId && !!this.accessToken;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private isRealEmail(email?: string | null): email is string {
    if (!email) return false;
    const lower = email.trim().toLowerCase();
    return !!lower && !PLACEHOLDER_EMAIL_SUFFIXES.some((suffix) => lower.endsWith(suffix));
  }

  /**
   * Reports a pipeline stage change for one contact. Best-effort and
   * fire-and-forget from the caller's perspective — never throws, so a
   * failure here (missing config, Meta API error, no usable match key)
   * can never block the actual stage change it's reporting on.
   */
  async reportStageChange(contact: Contact, stageName: string): Promise<void> {
    if (!this.isEnabled) return;
    if (!stageName?.trim()) return;

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

    // Nothing for Meta to match this event against — sending it would just
    // be a silently-ignored no-op on their end, so don't bother.
    if (!userData.lead_id && !userData.em && !userData.ph) return;

    const event = {
      event_name: stageName,
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'system_generated',
      custom_data: {
        event_source: 'crm',
        lead_event_source: 'EasyTeamCRM',
      },
      user_data: userData,
    };

    try {
      await this.httpService.axiosRef.post(
        `https://graph.facebook.com/${META_CAPI_VERSION}/${this.datasetId}/events`,
        { data: [event], access_token: this.accessToken },
      );
      this.logger.log(`[meta-capi] sent stage event "${stageName}" for contact ${contact.id}`);
    } catch (error: any) {
      this.logger.warn(
        `[meta-capi] failed to send stage event "${stageName}" for contact ${contact.id}: ${
          error?.response?.data?.error?.message || error?.message || 'unknown error'
        }`,
      );
    }
  }
}
