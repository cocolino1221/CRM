import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { Event, EventStatus } from '../database/entities/event.entity';
import { User } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';

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
  ) {}

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

    await this.eventRepository.save(event);

    this.logger.log(`Event updated: ${id}`);

    return this.findOne(workspaceId, id);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const event = await this.findOne(workspaceId, id);
    await this.eventRepository.softRemove(event);
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

  async generateMeetingLink(
    workspaceId: string,
    eventId: string,
    platform: 'zoom' | 'google_meet',
  ): Promise<{ link: string; meetingId?: string; password?: string }> {
    const event = await this.findOne(workspaceId, eventId);

    // Placeholder for actual Zoom/Google Meet API integration
    // In production, this would call the respective APIs
    if (platform === 'zoom') {
      const meetingId = `${Math.floor(Math.random() * 1000000000)}`;
      const password = Math.random().toString(36).substring(7);
      const link = `https://zoom.us/j/${meetingId}?pwd=${password}`;

      event.meetingLink = link;
      event.meetingId = meetingId;
      event.meetingPassword = password;
      event.meetingPlatform = 'zoom' as any;

      await this.eventRepository.save(event);

      return { link, meetingId, password };
    } else {
      // Google Meet placeholder
      const link = `https://meet.google.com/${Math.random().toString(36).substring(7)}`;
      event.meetingLink = link;
      event.meetingPlatform = 'google_meet' as any;
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
