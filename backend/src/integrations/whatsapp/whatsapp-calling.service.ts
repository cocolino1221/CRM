import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { firstValueFrom } from 'rxjs';
import { Integration, IntegrationType } from '../../database/entities/integration.entity';
import { Activity, ActivityType, ActivityDirection } from '../../database/entities/activity.entity';
import { normalizePhoneDigits } from '../../common/utils/phone.util';

export interface CallPermissionState {
  status: 'not_requested' | 'requested' | 'granted' | 'declined';
  requestedAt?: string;
  grantedAt?: string;
}

/**
 * Outbound WhatsApp voice calling (Meta Cloud API Calling — a distinct
 * capability from messaging, gated per phone number by Meta and enabled via
 * POST /{phone-number-id}/settings, not by anything in this app).
 *
 * WebRTC terminates in the browser/mobile client, not here — this service is
 * purely the signaling relay: it forwards the client's SDP offer to Meta and
 * relays whatever comes back over the webhook (SDP answer, ringing/rejected/
 * terminated status) to the client via WhatsAppCallingService.CALL_EVENT.
 */
@Injectable()
export class WhatsAppCallingService {
  private readonly logger = new Logger(WhatsAppCallingService.name);
  static readonly CALL_EVENT = 'whatsapp.call.event';
  private readonly apiUrl = 'https://graph.facebook.com/v21.0';

  constructor(
    @InjectRepository(Integration)
    private readonly integrationRepository: Repository<Integration>,
    @InjectRepository(Activity)
    private readonly activityRepository: Repository<Activity>,
    private readonly httpService: HttpService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Confirmed live against Meta's API: a call to a contact with an active
   * 24h session (recent inbound message) never hits a permission error —
   * only SDP validation — even with zero prior call_permission_request ever
   * sent. Calling permission is implicitly satisfied by the same session
   * window that lets free-form text messages send without a template.
   */
  private async hasActive24hSession(workspaceId: string, waId: string): Promise<boolean> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recent = await this.activityRepository
      .createQueryBuilder('activity')
      .where('activity.workspaceId = :workspaceId', { workspaceId })
      .andWhere('activity.type = :type', { type: ActivityType.WHATSAPP_MESSAGE })
      .andWhere('activity.direction = :direction', { direction: ActivityDirection.INBOUND })
      .andWhere("activity.metadata->>'waId' = :waId", { waId })
      .andWhere('activity.occurredAt > :since', { since })
      .getCount();
    return recent > 0;
  }

  private async getIntegration(workspaceId: string): Promise<Integration> {
    const integration = await this.integrationRepository.findOne({
      where: { type: IntegrationType.WHATSAPP, workspaceId },
    });
    if (!integration) throw new BadRequestException('No WhatsApp integration found for this workspace');
    return integration;
  }

  async findIntegrationByPhoneNumberId(phoneNumberId: string): Promise<Integration | null> {
    const integrations = await this.integrationRepository.find({ where: { type: IntegrationType.WHATSAPP } });
    return integrations.find((i) => i.credentials?.phoneNumberId === phoneNumberId) || null;
  }

  private getCredentials(integration: Integration): { accessToken: string; phoneNumberId: string } {
    const accessToken = integration.credentials?.accessToken || '';
    const phoneNumberId = integration.credentials?.phoneNumberId || '';
    if (!accessToken || !phoneNumberId) {
      throw new BadRequestException('WhatsApp integration is missing accessToken/phoneNumberId');
    }
    return { accessToken, phoneNumberId };
  }

  private metaErrorMessage(err: any, fallback: string): string {
    const metaError = err?.response?.data?.error;
    return metaError?.error_user_msg || metaError?.message || fallback;
  }

  /**
   * One-time enablement of Cloud API Calling for this number. Safe to call
   * repeatedly — it's a status toggle, not a one-shot action. Meta's own
   * enable call is occasionally transiently flaky; retries here so callers
   * don't need to know that.
   */
  async ensureCallingEnabled(workspaceId: string): Promise<{ status: string }> {
    const integration = await this.getIntegration(workspaceId);
    const { accessToken, phoneNumberId } = this.getCredentials(integration);
    const settingsUrl = `${this.apiUrl}/${phoneNumberId}/settings`;
    const headers = { Authorization: `Bearer ${accessToken}` };

    const current = await firstValueFrom(this.httpService.get(settingsUrl, { headers }));
    if (current.data?.calling?.status === 'ENABLED') {
      return current.data.calling;
    }

    let lastErr: any;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await firstValueFrom(this.httpService.post(
          settingsUrl,
          { calling: { status: 'ENABLED', call_icon_visibility: 'DEFAULT' } },
          { headers },
        ));
        lastErr = null;
        break;
      } catch (err: any) {
        lastErr = err;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 1500));
      }
    }
    if (lastErr) {
      throw new BadRequestException(this.metaErrorMessage(lastErr, 'Failed to enable calling'));
    }

    const after = await firstValueFrom(this.httpService.get(settingsUrl, { headers }));
    return after.data?.calling || { status: 'UNKNOWN' };
  }

  /**
   * Requests calling permission from a contact — required before the first
   * call (and Meta's grants expire, so this may need repeating). The contact
   * accepts/declines from within their own WhatsApp app; the result isn't
   * known synchronously, only via whatever the contact does next.
   */
  async requestCallPermission(workspaceId: string, waId: string): Promise<void> {
    const normalizedWaId = normalizePhoneDigits(waId);
    if (!normalizedWaId) throw new BadRequestException('Invalid contact');
    const integration = await this.getIntegration(workspaceId);
    const { accessToken, phoneNumberId } = this.getCredentials(integration);

    try {
      await firstValueFrom(this.httpService.post(
        `${this.apiUrl}/${phoneNumberId}/messages`,
        {
          messaging_product: 'whatsapp',
          to: normalizedWaId,
          type: 'interactive',
          interactive: {
            type: 'call_permission_request',
            action: { name: 'call_permission_request' },
          },
        },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ));
    } catch (err: any) {
      throw new BadRequestException(this.metaErrorMessage(err, 'Failed to send call permission request'));
    }

    const map = this.normalizePermissionMap(integration.config?.callPermissionMap);
    map[normalizedWaId] = { status: 'requested', requestedAt: new Date().toISOString() };
    integration.config = { ...(integration.config || {}), callPermissionMap: map };
    await this.integrationRepository.save(integration);
  }

  async getCallPermissionStatus(workspaceId: string, waId: string): Promise<CallPermissionState> {
    const normalizedWaId = normalizePhoneDigits(waId);
    if (!normalizedWaId) throw new BadRequestException('Invalid contact');

    if (await this.hasActive24hSession(workspaceId, normalizedWaId)) {
      return { status: 'granted' };
    }

    const integration = await this.getIntegration(workspaceId);
    const map = this.normalizePermissionMap(integration.config?.callPermissionMap);
    return map[normalizedWaId] || { status: 'not_requested' };
  }

  /**
   * Places an outbound call with a client-generated SDP offer. This only
   * confirms Meta accepted the request (the contact's phone starts
   * ringing) — the SDP *answer*, once they pick up, arrives later via the
   * calls webhook and is relayed over CALL_EVENT, not returned here.
   */
  async initiateCall(workspaceId: string, waId: string, sdpOffer: string): Promise<{ callId: string }> {
    const normalizedWaId = normalizePhoneDigits(waId);
    if (!normalizedWaId) throw new BadRequestException('Invalid contact');
    if (!sdpOffer) throw new BadRequestException('Missing SDP offer');
    const integration = await this.getIntegration(workspaceId);
    const { accessToken, phoneNumberId } = this.getCredentials(integration);

    let response: any;
    try {
      response = await firstValueFrom(this.httpService.post(
        `${this.apiUrl}/${phoneNumberId}/calls`,
        {
          messaging_product: 'whatsapp',
          to: normalizedWaId,
          action: 'connect',
          session: { sdp_type: 'offer', sdp: sdpOffer },
        },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ));
    } catch (err: any) {
      throw new BadRequestException(this.metaErrorMessage(err, 'Failed to initiate call'));
    }

    const callId = response.data?.calls?.[0]?.id || response.data?.id || '';
    this.emitCallEvent(workspaceId, { type: 'initiated', callId, waId: normalizedWaId });
    this.logger.log(`Call initiated: callId=${callId} to=${normalizedWaId} workspace=${workspaceId}`);
    return { callId };
  }

  /** Ends an in-progress or still-ringing call. */
  async terminateCall(workspaceId: string, callId: string): Promise<void> {
    if (!callId) throw new BadRequestException('Missing call id');
    const integration = await this.getIntegration(workspaceId);
    const { accessToken, phoneNumberId } = this.getCredentials(integration);
    try {
      await firstValueFrom(this.httpService.post(
        `${this.apiUrl}/${phoneNumberId}/calls`,
        { messaging_product: 'whatsapp', call_id: callId, action: 'terminate' },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      ));
    } catch (err: any) {
      this.logger.warn(`Terminate call ${callId} failed: ${this.metaErrorMessage(err, err.message)}`);
    }
    this.emitCallEvent(workspaceId, { type: 'terminated', callId });
  }

  /**
   * Routes an inbound `calls` webhook field payload for a workspace. Relayed
   * to the client as close to verbatim as possible (rather than mapped onto
   * a fixed enum of expected event names) — Meta's Calling API is newer and
   * less documented than messaging, so the client's WebRTC logic keys off
   * the presence of `session.sdp_type === 'answer'` and generic status
   * strings rather than this service pre-interpreting them.
   */
  async handleCallWebhook(workspaceId: string, value: any): Promise<void> {
    const calls = Array.isArray(value?.calls) ? value.calls : [];
    for (const call of calls) {
      this.logger.log(`Call webhook event workspace=${workspaceId}: ${JSON.stringify(call).slice(0, 300)}`);
      this.emitCallEvent(workspaceId, {
        type: 'webhook',
        callId: call.id,
        event: call.event,
        direction: call.direction,
        session: call.session,
        from: call.from,
        to: call.to,
        timestamp: call.timestamp,
      });

      // A granted call_permission_request surfaces here too (Meta delivers
      // it as a status/interactive event on the same webhook object type
      // used for messages, not the calls array) — permission-state updates
      // from the messages path are handled in whatsapp.service.ts and
      // should call recordCallPermissionGranted below.
    }
  }

  async recordCallPermissionGranted(workspaceId: string, waId: string): Promise<void> {
    const normalizedWaId = normalizePhoneDigits(waId);
    if (!normalizedWaId) return;
    const integration = await this.getIntegration(workspaceId).catch(() => null);
    if (!integration) return;
    const map = this.normalizePermissionMap(integration.config?.callPermissionMap);
    map[normalizedWaId] = { ...(map[normalizedWaId] || {}), status: 'granted', grantedAt: new Date().toISOString() } as CallPermissionState;
    integration.config = { ...(integration.config || {}), callPermissionMap: map };
    await this.integrationRepository.save(integration);
  }

  private emitCallEvent(workspaceId: string, payload: Record<string, any>): void {
    this.eventEmitter.emit(WhatsAppCallingService.CALL_EVENT, { workspaceId, ...payload });
  }

  private normalizePermissionMap(value: any): Record<string, CallPermissionState> {
    if (!value || typeof value !== 'object') return {};
    return value;
  }
}
