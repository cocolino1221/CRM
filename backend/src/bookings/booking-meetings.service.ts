import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Booking } from '../database/entities/booking.entity';
import { Integration, IntegrationStatus, IntegrationType } from '../database/entities/integration.entity';
import { User } from '../database/entities/user.entity';
import { Workspace } from '../database/entities/workspace.entity';
import { GoogleIntegrationHandler } from '../integrations/handlers/google.handler';
import { ZoomIntegrationHandler } from '../integrations/handlers/zoom.handler';
import { EmailService } from '../email/email.service';

export type MeetingProvider = 'google_meet' | 'zoom' | 'none';

export interface MeetingOutcome {
  provider: MeetingProvider;
  link?: string;
  /** Who got the email with the link. */
  emailed: { lead: boolean; host: boolean };
  /** Why there is no link, in words a caller can show. */
  warning?: string;
}

/** Older rows and meeting types say "meet"; this module says "google_meet". */
export function normalizeProvider(value?: string | null): MeetingProvider | undefined {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'google_meet' || v === 'meet' || v === 'google') return 'google_meet';
  if (v === 'zoom') return 'zoom';
  if (v === 'none' || v === 'phone' || v === 'in-person' || v === 'in_person') return 'none';
  return undefined;
}

/**
 * Pick the platform for a booking: what was asked for, else the closer's own
 * preference, else whatever the workspace has connected (Meet first). A
 * platform that isn't connected is never chosen — the booking simply gets no
 * link and the caller is told why.
 */
export function chooseProvider(
  available: { google_meet: boolean; zoom: boolean },
  requested?: MeetingProvider,
  hostPreference?: MeetingProvider,
): MeetingProvider {
  if (requested === 'none') return 'none';
  if (requested && available[requested]) return requested;
  if (hostPreference === 'none') return 'none';
  if (hostPreference && available[hostPreference]) return hostPreference;
  if (available.google_meet) return 'google_meet';
  if (available.zoom) return 'zoom';
  return 'none';
}

/** Leads from Meta/WhatsApp get a made-up address; never mail it. */
export function isDeliverableEmail(email?: string | null): boolean {
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return false;
  return !/\.invalid$|placeholder|@example\.(com|org)$/.test(e);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function personName(user?: Partial<User> | null): string {
  return `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.email || '';
}

/** "Google Calendar → add event" link for the lead's email. */
export function googleCalendarUrl(title: string, start: Date, end: Date, details: string): string {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const qs = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${fmt(start)}/${fmt(end)}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${qs}`;
}

@Injectable()
export class BookingMeetingsService {
  private readonly logger = new Logger(BookingMeetingsService.name);

  constructor(
    @InjectRepository(Booking) private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(Integration) private readonly integrationRepository: Repository<Integration>,
    @InjectRepository(Workspace) private readonly workspaceRepository: Repository<Workspace>,
    private readonly googleHandler: GoogleIntegrationHandler,
    private readonly zoomHandler: ZoomIntegrationHandler,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  private findActive(workspaceId: string, type: IntegrationType): Promise<Integration | null> {
    return this.integrationRepository.findOne({
      where: { workspaceId, type, status: IntegrationStatus.ACTIVE },
      order: { createdAt: 'ASC' },
    });
  }

  async availableProviders(workspaceId: string): Promise<{ google_meet: boolean; zoom: boolean }> {
    const [google, zoom] = await Promise.all([
      this.findActive(workspaceId, IntegrationType.GOOGLE),
      this.findActive(workspaceId, IntegrationType.ZOOM),
    ]);
    return { google_meet: !!google, zoom: !!zoom };
  }

  /**
   * Give a freshly saved booking its meeting link and email it to the lead and
   * the closer. Never throws: a booking that was made stays made even when
   * Google, Zoom or the mail server is down — the caller gets a warning.
   */
  async setUpMeeting(bookingId: string, requested?: string | null): Promise<MeetingOutcome> {
    const outcome: MeetingOutcome = { provider: 'none', emailed: { lead: false, host: false } };
    const booking = await this.bookingRepository.findOne({
      where: { id: bookingId },
      relations: ['host', 'contact', 'meetingType'],
    });
    if (!booking) return { ...outcome, warning: 'Programarea nu a fost găsită.' };

    // A meeting type can carry its own fixed link (a personal Zoom room).
    // Nothing to create then — just tell both sides.
    const fixedLink = /^https?:\/\//i.test(String(booking.location || '')) && !booking.externalMeetingId;
    if (fixedLink && !normalizeProvider(requested)) {
      outcome.provider = normalizeProvider(booking.locationType) ?? 'none';
      outcome.link = booking.location!;
      outcome.emailed = await this.sendInvites(booking, outcome.link, outcome.provider);
      return outcome;
    }

    try {
      const available = await this.availableProviders(booking.workspaceId);
      // The meeting type's locationType is not used here: it defaults to
      // "zoom" in the database without anyone having chosen it, and would
      // override the closer's own choice.
      const provider = chooseProvider(
        available,
        normalizeProvider(requested),
        normalizeProvider((booking.host?.preferences as any)?.meetingProvider),
      );
      outcome.provider = provider;

      if (provider === 'none') {
        // Both halves matter. Asking for Zoom and not getting it is obvious
        // enough, but the quiet case was worse: book without naming a
        // platform while none is connected and there was no link, no email
        // to either side, and nothing said — the dialog simply closed.
        outcome.warning =
          normalizeProvider(requested) && normalizeProvider(requested) !== 'none'
            ? 'Platforma aleasă nu e conectată la Integrations, așa că nu s-a creat link.'
            : 'Nicio platformă de întâlniri nu e conectată la Integrations: nu s-a creat link și nu s-a trimis niciun email.';
      } else {
        const lead = this.leadOf(booking);
        const created = await this.createMeeting(booking, provider, lead.email);
        booking.locationType = provider;
        booking.location = created.link;
        booking.externalMeetingId = created.externalId;
        await this.bookingRepository.save(booking);
        outcome.link = created.link;
      }
    } catch (error: any) {
      const detail = error?.response?.data?.error?.message || error?.response?.data?.message || error?.message;
      this.logger.warn(`Meeting link for booking ${bookingId} failed (${outcome.provider}): ${detail}`);
      outcome.warning =
        outcome.provider === 'google_meet'
          ? 'Nu s-a putut crea linkul Google Meet. Reconectează Google la Integrations.'
          : 'Nu s-a putut crea linkul Zoom. Verifică datele Zoom la Integrations.';
      outcome.provider = 'none';
    }

    if (outcome.link) {
      outcome.emailed = await this.sendInvites(booking, outcome.link, outcome.provider);
    }
    return outcome;
  }

  private leadOf(booking: Booking): { name: string; email?: string } {
    const contact: any = booking.contact;
    const name =
      String(booking.guestName || '').trim() ||
      `${contact?.firstName || ''} ${contact?.lastName || ''}`.trim() ||
      'Client';
    const email = [booking.guestEmail, contact?.email].find((e) => isDeliverableEmail(e)) || undefined;
    return { name, email };
  }

  private async createMeeting(
    booking: Booking,
    provider: Exclude<MeetingProvider, 'none'>,
    leadEmail?: string,
  ): Promise<{ link: string; externalId?: string }> {
    const lead = this.leadOf(booking);
    const title = `${booking.meetingType?.name || 'Întâlnire'} — ${lead.name}`;

    if (provider === 'zoom') {
      const integration = await this.findActive(booking.workspaceId, IntegrationType.ZOOM);
      if (!integration) throw new Error('Zoom is not connected');
      const meeting = await this.zoomHandler.createMeetingForIntegration(integration, {
        topic: title,
        type: 2,
        startTime: booking.startTime.toISOString(),
        duration: booking.duration,
        timezone: 'UTC',
        settings: { waitingRoom: false, joinBeforeHost: true },
      });
      if (!meeting?.join_url) throw new Error('Zoom returned no join_url');
      return { link: meeting.join_url, externalId: meeting.id ? String(meeting.id) : undefined };
    }

    const integration = await this.findActive(booking.workspaceId, IntegrationType.GOOGLE);
    if (!integration) throw new Error('Google is not connected');
    const attendees = [booking.host?.email, leadEmail].filter((e): e is string => isDeliverableEmail(e));
    const event = await this.googleHandler.createMeetEvent(integration, {
      summary: title,
      description: booking.notes || undefined,
      startTime: booking.startTime.toISOString(),
      endTime: booking.endTime.toISOString(),
      attendeeEmails: attendees,
    });
    const link =
      event?.hangoutLink ||
      event?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri;
    if (!link) throw new Error('Google Calendar returned no Meet link');
    return { link, externalId: event?.id };
  }

  private async timezoneFor(booking: Booking): Promise<string> {
    if (booking.timezone && booking.timezone !== 'UTC') return booking.timezone;
    const workspace = await this.workspaceRepository.findOne({ where: { id: booking.workspaceId } });
    return (workspace?.settings as any)?.timezone || 'Europe/Bucharest';
  }

  private async sendInvites(
    booking: Booking,
    link: string,
    provider: MeetingProvider,
  ): Promise<{ lead: boolean; host: boolean }> {
    const lead = this.leadOf(booking);
    const hostName = personName(booking.host);
    const timeZone = await this.timezoneFor(booking);
    const when = new Intl.DateTimeFormat('ro-RO', {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(booking.startTime);
    const platform = provider === 'zoom' ? 'Zoom' : 'Google Meet';
    const from = this.configService.get<string>('FROM_EMAIL') || undefined;
    const meetingName = booking.meetingType?.name || 'Întâlnire';

    const card = (greeting: string, lines: string[], extra = '') => `
      <div style="font-family:Inter,Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#0f172a">
        <p style="font-size:16px">${greeting}</p>
        ${lines.map((l) => `<p style="font-size:15px;line-height:1.5;margin:8px 0">${l}</p>`).join('')}
        <p style="margin:24px 0">
          <a href="${escapeHtml(link)}" style="background:#2563eb;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">Intră în întâlnire (${platform})</a>
        </p>
        <p style="font-size:13px;color:#64748b">Sau copiază linkul: <a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>
        ${extra}
      </div>`;

    const result = { lead: false, host: false };

    if (lead.email) {
      const calendar = googleCalendarUrl(
        `${meetingName} cu ${hostName || 'echipa noastră'}`,
        booking.startTime,
        booking.endTime,
        `Link întâlnire: ${link}`,
      );
      result.lead = await this.emailService.sendEmail({
        from,
        to: lead.email,
        subject: `Programarea ta: ${when}`,
        html: card(
          `Salut ${escapeHtml(lead.name)},`,
          [
            `Ai o programare <b>${escapeHtml(meetingName)}</b>${hostName ? ` cu <b>${escapeHtml(hostName)}</b>` : ''}.`,
            `<b>Când:</b> ${escapeHtml(when)}`,
          ],
          `<p style="font-size:13px"><a href="${escapeHtml(calendar)}">Adaugă în Google Calendar</a></p>`,
        ),
        text: `Salut ${lead.name},\n\nAi o programare ${meetingName}${hostName ? ` cu ${hostName}` : ''} ${when}.\nLink: ${link}\n`,
      });
    }

    if (isDeliverableEmail(booking.host?.email)) {
      const phone = booking.guestPhone || (booking.contact as any)?.phone;
      result.host = await this.emailService.sendEmail({
        from,
        to: booking.host!.email,
        subject: `Programare nouă: ${lead.name} — ${when}`,
        html: card(
          `Salut ${escapeHtml(hostName || '')},`,
          [
            `Ai o programare nouă cu <b>${escapeHtml(lead.name)}</b>.`,
            `<b>Când:</b> ${escapeHtml(when)}`,
            ...(phone ? [`<b>Telefon:</b> ${escapeHtml(String(phone))}`] : []),
            ...(lead.email ? [`<b>Email:</b> ${escapeHtml(lead.email)}`] : ['<i>Lead-ul nu are email, nu a primit linkul pe email.</i>']),
          ],
        ),
        text: `Programare nouă cu ${lead.name}, ${when}.\nLink: ${link}\n`,
      });
    }

    return result;
  }

  /**
   * After a booking moved to another hour: replace the meeting we created
   * (its time is baked in) and email both sides the new time and link.
   */
  async moveMeeting(booking: Booking): Promise<MeetingOutcome | undefined> {
    const provider = normalizeProvider(booking.locationType);
    if (booking.externalMeetingId) {
      await this.cancelMeeting(booking);
      booking.location = null as any;
      booking.externalMeetingId = null as any;
      await this.bookingRepository.save(booking);
      return this.setUpMeeting(booking.id, provider);
    }
    if (/^https?:\/\//i.test(String(booking.location || ''))) {
      return this.setUpMeeting(booking.id);
    }
    return undefined;
  }

  /** Best effort: a cancelled booking shouldn't leave a live meeting behind. */
  async cancelMeeting(booking: Booking): Promise<void> {
    if (!booking.externalMeetingId) return;
    const provider = normalizeProvider(booking.locationType);
    try {
      if (provider === 'zoom') {
        const integration = await this.findActive(booking.workspaceId, IntegrationType.ZOOM);
        if (integration) await this.zoomHandler.deleteMeetingForIntegration(integration, booking.externalMeetingId);
      } else if (provider === 'google_meet') {
        const integration = await this.findActive(booking.workspaceId, IntegrationType.GOOGLE);
        if (integration) await this.googleHandler.deleteCalendarEvent(integration, booking.externalMeetingId);
      }
    } catch (error: any) {
      this.logger.warn(`Could not remove meeting for booking ${booking.id}: ${error?.message}`);
    }
  }
}
