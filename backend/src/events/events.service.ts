import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Event, EventStatus, MeetingPlatform } from '../database/entities/event.entity';
import { User } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';
import { Integration, IntegrationType, IntegrationStatus } from '../database/entities/integration.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ZoomIntegrationHandler } from '../integrations/handlers/zoom.handler';
import { GoogleIntegrationHandler } from '../integrations/handlers/google.handler';
import { MeetingReminderDispatchService } from './meeting-reminder-dispatch.service';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    @InjectRepository(Event)
    private eventRepository: Repository<Event>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Contact)
    private contactRepository: Repository<Contact>,
    @InjectRepository(Integration)
    private readonly integrationRepository: Repository<Integration>,
    private readonly zoomHandler: ZoomIntegrationHandler,
    private readonly googleHandler: GoogleIntegrationHandler,
    private readonly meetingReminderDispatch: MeetingReminderDispatchService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  /**
   * Best-effort auto-generation of a real Zoom/Meet link (dto.autoGenerateMeetingLink
   * already existed as an accepted-but-ignored field). Never throws — event
   * creation must succeed even if the provider call fails (missing/expired
   * credentials, API error, etc.); it just leaves meetingLink as whatever was
   * manually provided (usually blank).
   */
  /**
   * Schedule (or skip) the "before_meeting" WhatsApp reminder for an event.
   * `event.customFields.whatsappReminder` carries a per-event override written
   * by the Calendar UI: `{ enabled?, flowId?, hoursBefore? }`. Any field left
   * unset falls back to the previous workspace-wide auto-pick behavior, so
   * events created without touching the new UI are unaffected.
   */
  private async scheduleMeetingReminder(workspaceId: string, event: Event): Promise<void> {
    try {
      const override = (event.customFields as any)?.whatsappReminder as
        | { enabled?: boolean; flowId?: string; hoursBefore?: number }
        | undefined;

      if (override?.enabled === false) {
        await this.meetingReminderDispatch.cancel(event.id).catch(() => undefined);
        return;
      }

      const flows = await this.whatsAppService.getFlows(workspaceId);
      const beforeMeetingFlows = flows.filter((f: any) => f.trigger === 'before_meeting' && f.steps?.length > 0);

      let flow = override?.flowId
        ? beforeMeetingFlows.find((f: any) => f.id === override.flowId)
        : undefined;
      if (!flow) {
        flow = beforeMeetingFlows.find((f: any) => f.enabled);
      }
      if (!flow) return; // feature not configured for this workspace — fine, optional

      const hoursBefore = Number(override?.hoursBefore) > 0
        ? Number(override!.hoursBefore)
        : (Number(flow.reminderHoursBefore) > 0 ? Number(flow.reminderHoursBefore) : 3);
      const sendAt = new Date(new Date(event.startDate).getTime() - hoursBefore * 60 * 60 * 1000);
      await this.meetingReminderDispatch.schedule(event.id, workspaceId, sendAt);
    } catch (err: any) {
      this.logger.warn(`scheduleMeetingReminder failed for event ${event.id}: ${err?.message}`);
    }
  }

  async create(workspaceId: string, organizerId: string, dto: CreateEventDto): Promise<Event> {
    // Validate organizer
    const organizer = await this.userRepository.findOne({
      where: { id: organizerId, workspaceId },
    });

    if (!organizer) {
      throw new NotFoundException('Organizer not found');
    }

    // Validate dates
    if (new Date(dto.startDate) >= new Date(dto.endDate)) {
      throw new BadRequestException('End date must be after start date');
    }

    // Create event
    const event = this.eventRepository.create({
      ...dto,
      workspaceId,
      organizerId,
    });

    // Add attendees if provided
    if (dto.attendeeIds && dto.attendeeIds.length > 0) {
      const attendees = await this.userRepository.find({
        where: { id: In(dto.attendeeIds), workspaceId },
      });
      event.attendees = attendees;
    }

    const savedEvent = await this.eventRepository.save(event);

    this.logger.log(`Event created: ${savedEvent.id} by user ${organizerId}`);

    // Best-effort — a Zoom/Google failure (missing integration, API error)
    // must never block event creation; the event just keeps whatever
    // meetingLink was manually provided (usually blank).
    if (dto.autoGenerateMeetingLink && (savedEvent.meetingPlatform === MeetingPlatform.ZOOM || savedEvent.meetingPlatform === MeetingPlatform.GOOGLE_MEET)) {
      try {
        await this.generateMeetingLink(workspaceId, savedEvent.id, savedEvent.meetingPlatform === MeetingPlatform.ZOOM ? 'zoom' : 'google_meet');
      } catch (err: any) {
        this.logger.warn(`autoGenerateMeetingLink failed for event ${savedEvent.id}: ${err?.message}`);
      }
    }

    await this.scheduleMeetingReminder(workspaceId, savedEvent);

    return this.findOne(workspaceId, savedEvent.id);
  }

  async findAll(
    workspaceId: string,
    userId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      type?: string;
      status?: string;
      viewTeam?: boolean;
    },
  ): Promise<Event[]> {
    const queryBuilder = this.eventRepository
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.organizer', 'organizer')
      .leftJoinAndSelect('event.attendees', 'attendees')
      .leftJoinAndSelect('event.contact', 'contact')
      .leftJoinAndSelect('event.deal', 'deal')
      .where('event.workspaceId = :workspaceId', { workspaceId })
      .andWhere('event.deletedAt IS NULL');

    // If not team view, only show events where user is organizer or attendee
    if (!filters?.viewTeam) {
      queryBuilder.andWhere(
        '(event.organizerId = :userId OR attendees.id = :userId)',
        { userId },
      );
    }

    // Date range filter
    if (filters?.startDate && filters?.endDate) {
      queryBuilder.andWhere('event.startDate BETWEEN :startDate AND :endDate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    }

    // Type filter
    if (filters?.type) {
      queryBuilder.andWhere('event.type = :type', { type: filters.type });
    }

    // Status filter
    if (filters?.status) {
      queryBuilder.andWhere('event.status = :status', { status: filters.status });
    }

    queryBuilder.orderBy('event.startDate', 'ASC');

    return queryBuilder.getMany();
  }

  async findOne(workspaceId: string, id: string): Promise<Event> {
    const event = await this.eventRepository.findOne({
      where: { id, workspaceId },
      relations: ['organizer', 'attendees', 'contact', 'deal'],
    });

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    return event;
  }

  async update(
    workspaceId: string,
    id: string,
    dto: UpdateEventDto,
  ): Promise<Event> {
    const event = await this.findOne(workspaceId, id);

    // Update attendees if provided
    if (dto.attendeeIds) {
      const attendees = await this.userRepository.find({
        where: { id: In(dto.attendeeIds), workspaceId },
      });
      event.attendees = attendees;
    }

    Object.assign(event, dto);

    const saved = await this.eventRepository.save(event);

    this.logger.log(`Event updated: ${id}`);

    if (saved.status === EventStatus.CANCELLED) {
      await this.meetingReminderDispatch.cancel(saved.id).catch(() => undefined);
    } else {
      // Reschedule covers a startDate change; harmless no-op cancel+re-add otherwise.
      await this.scheduleMeetingReminder(workspaceId, saved);
    }

    return this.findOne(workspaceId, id);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const event = await this.findOne(workspaceId, id);
    await this.eventRepository.softRemove(event);
    await this.meetingReminderDispatch.cancel(id).catch(() => undefined);
    this.logger.log(`Event deleted: ${id}`);
  }

  async scheduleForUser(
    workspaceId: string,
    schedulerId: string,
    targetUserId: string,
    dto: CreateEventDto,
  ): Promise<Event> {
    // Verify target user exists
    const targetUser = await this.userRepository.findOne({
      where: { id: targetUserId, workspaceId },
    });

    if (!targetUser) {
      throw new NotFoundException('Target user not found');
    }

    // Create event with target user as organizer
    const event = await this.create(workspaceId, targetUserId, dto);

    this.logger.log(`User ${schedulerId} scheduled event for user ${targetUserId}`);

    return event;
  }

  /**
   * Generate a real Zoom/Google Meet link for an event and save it (was a
   * placeholder that returned a fake-looking URL with no actual API call —
   * `event.meetingLink` never worked for real). Throws if the provider
   * integration is missing/inactive or the API call fails; `create()` below
   * catches this so link generation never blocks event creation.
   */
  async generateMeetingLink(
    workspaceId: string,
    eventId: string,
    platform: 'zoom' | 'google_meet',
  ): Promise<{ link: string; meetingId?: string; password?: string }> {
    const event = await this.findOne(workspaceId, eventId);

    if (platform === 'zoom') {
      const integration = await this.integrationRepository.findOne({
        where: { workspaceId, type: IntegrationType.ZOOM, status: IntegrationStatus.ACTIVE },
      });
      if (!integration) {
        throw new BadRequestException('No active Zoom integration for this workspace');
      }
      const duration = Math.max(1, Math.round((new Date(event.endDate).getTime() - new Date(event.startDate).getTime()) / 60000));
      const meeting = await this.zoomHandler.createMeetingForIntegration(integration, {
        topic: event.title,
        type: 2,
        startTime: new Date(event.startDate).toISOString(),
        duration,
      });
      const link = meeting?.join_url;
      const meetingId = meeting?.id ? String(meeting.id) : undefined;
      const password = meeting?.password;
      if (!link) throw new BadRequestException('Zoom did not return a meeting link');

      event.meetingLink = link;
      event.meetingId = meetingId;
      event.meetingPassword = password;
      event.meetingPlatform = MeetingPlatform.ZOOM;
      await this.eventRepository.save(event);

      return { link, meetingId, password };
    } else {
      const integration = await this.integrationRepository.findOne({
        where: { workspaceId, type: IntegrationType.GOOGLE, status: IntegrationStatus.ACTIVE },
      });
      if (!integration) {
        throw new BadRequestException('No active Google integration for this workspace');
      }
      const calEvent = await this.googleHandler.createMeetEvent(integration, {
        summary: event.title,
        startTime: new Date(event.startDate).toISOString(),
        endTime: new Date(event.endDate).toISOString(),
        attendeeEmails: event.contact?.email ? [event.contact.email] : undefined,
      });
      const link = calEvent?.hangoutLink
        || calEvent?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === 'video')?.uri;
      if (!link) throw new BadRequestException('Google Calendar did not return a Meet link');

      event.meetingLink = link;
      event.meetingPlatform = MeetingPlatform.GOOGLE_MEET;
      event.externalEventId = calEvent?.id;
      await this.eventRepository.save(event);

      return { link };
    }
  }

  async getTeamCalendar(
    workspaceId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{ user: User; events: Event[] }[]> {
    const users = await this.userRepository.find({
      where: { workspaceId, isActive: true },
    });

    const result = [];

    for (const user of users) {
      const events = await this.eventRepository.find({
        where: {
          workspaceId,
          startDate: Between(startDate, endDate),
          organizerId: user.id,
        },
        relations: ['contact', 'deal'],
        order: { startDate: 'ASC' },
      });

      result.push({ user, events });
    }

    return result;
  }

  async handleCalendlyWebhook(payload: any): Promise<Event> {
    // Extract event data from Calendly webhook
    const {
      event: webhookEvent,
      payload: eventPayload,
    } = payload;

    if (webhookEvent !== 'invitee.created') {
      return null;
    }

    const { scheduled_event, invitee } = eventPayload;

    // Find or create contact
    let contact = await this.contactRepository.findOne({
      where: { email: invitee.email },
    });

    // Find available closer (round-robin or based on availability)
    const closers = await this.userRepository.find({
      where: { role: 'CLOSER' as any, isActive: true },
    });

    if (closers.length === 0) {
      throw new BadRequestException('No available closers');
    }

    const assignedCloser = closers[0]; // Simple assignment, can be improved

    // Create event
    const event = this.eventRepository.create({
      title: `${scheduled_event.name} - ${invitee.name}`,
      type: 'meeting' as any,
      status: EventStatus.SCHEDULED,
      startDate: new Date(scheduled_event.start_time),
      endDate: new Date(scheduled_event.end_time),
      workspaceId: assignedCloser.workspaceId,
      organizerId: assignedCloser.id,
      contactId: contact?.id,
      source: 'calendly',
      externalEventId: scheduled_event.uri,
      location: scheduled_event.location?.join_url,
    });

    await this.eventRepository.save(event);

    this.logger.log(`Calendly event created: ${event.id}`);

    return event;
  }
}
