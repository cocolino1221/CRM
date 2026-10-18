import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan, MoreThan, Not } from 'typeorm';
import { Availability, DayOfWeek } from '../database/entities/availability.entity';
import { MeetingType } from '../database/entities/meeting-type.entity';
import { Booking, BookingStatus } from '../database/entities/booking.entity';
import { User } from '../database/entities/user.entity';
import { Contact } from '../database/entities/contact.entity';
import { CreateAvailabilityDto } from './dto/create-availability.dto';
import { CreateMeetingTypeDto } from './dto/create-meeting-type.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../database/entities/notification.entity';
import { ContactsService } from '../contacts/contacts.service';
import { ContactSource, ContactStatus } from '../database/entities/contact.entity';
import { UserRole, UserStatus } from '../database/entities/user.entity';

@Injectable()
export class SchedulingService {
  private readonly logger = new Logger(SchedulingService.name);

  constructor(
    @InjectRepository(Availability)
    private readonly availabilityRepository: Repository<Availability>,
    @InjectRepository(MeetingType)
    private readonly meetingTypeRepository: Repository<MeetingType>,
    @InjectRepository(Booking)
    private readonly bookingRepository: Repository<Booking>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    private readonly notificationsService: NotificationsService,
    private readonly contactsService: ContactsService,
  ) {}

  // ========== Availability Management ==========

  async createAvailability(workspaceId: string, userId: string, dto: CreateAvailabilityDto) {
    const availability = this.availabilityRepository.create({
      ...dto,
      workspaceId,
      userId,
    });

    return this.availabilityRepository.save(availability);
  }

  async getAvailabilities(workspaceId: string, userId: string) {
    return this.availabilityRepository.find({
      where: { workspaceId, userId, deletedAt: null as any },
      order: { dayOfWeek: 'ASC', startTime: 'ASC' },
    });
  }

  async updateAvailability(workspaceId: string, id: string, dto: Partial<CreateAvailabilityDto>) {
    const availability = await this.availabilityRepository.findOne({
      where: { id, workspaceId, deletedAt: null as any },
    });

    if (!availability) {
      throw new NotFoundException('Availability not found');
    }

    Object.assign(availability, dto);
    return this.availabilityRepository.save(availability);
  }

  async deleteAvailability(workspaceId: string, id: string) {
    const result = await this.availabilityRepository.softDelete({ id, workspaceId });
    if (result.affected === 0) {
      throw new NotFoundException('Availability not found');
    }
  }

  // ========== Meeting Types Management ==========

  async createMeetingType(workspaceId: string, userId: string, dto: CreateMeetingTypeDto) {
    const meetingType = this.meetingTypeRepository.create({
      ...dto,
      workspaceId,
      userId,
    });

    return this.meetingTypeRepository.save(meetingType);
  }

  async getMeetingTypes(workspaceId: string, userId?: string) {
    const where: any = { workspaceId, deletedAt: null as any };
    if (userId) where.userId = userId;

    return this.meetingTypeRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async getMeetingTypeBySlug(slug: string) {
    const meetingType = await this.meetingTypeRepository.findOne({
      where: { slug, isActive: true, isPublic: true, deletedAt: null as any },
      relations: ['user'],
    });

    if (!meetingType) {
      throw new NotFoundException('Meeting type not found');
    }

    return meetingType;
  }

  async updateMeetingType(workspaceId: string, id: string, dto: Partial<CreateMeetingTypeDto>) {
    const meetingType = await this.meetingTypeRepository.findOne({
      where: { id, workspaceId, deletedAt: null as any },
    });

    if (!meetingType) {
      throw new NotFoundException('Meeting type not found');
    }

    Object.assign(meetingType, dto);
    return this.meetingTypeRepository.save(meetingType);
  }

  async deleteMeetingType(workspaceId: string, id: string) {
    const result = await this.meetingTypeRepository.softDelete({ id, workspaceId });
    if (result.affected === 0) {
      throw new NotFoundException('Meeting type not found');
    }
  }

  // ========== Available Slots ==========

  async getAvailableSlots(slug: string, date: Date, timezone: string = 'UTC') {
    const meetingType = await this.getMeetingTypeBySlug(slug);
    return this.slotsForMeetingType(meetingType, date);
  }

  /**
   * Every free hour in the workspace that slug belongs to, with the people
   * free at each.
   *
   * The lead picks an hour first and a person second — which is the way round
   * someone who just filled in a form thinks about it. The slug in the link is
   * only how the page finds the workspace; whose link it was does not narrow
   * what the lead is offered.
   */
  async getTeamSlots(slug: string, date: Date) {
    const entry = await this.getMeetingTypeBySlug(slug);

    const meetingTypes = await this.meetingTypeRepository.find({
      where: { workspaceId: entry.workspaceId, isActive: true, isPublic: true, deletedAt: null as any },
      relations: ['user'],
    });

    const byStart = new Map<string, { startTime: string; endTime: string; duration: number; hosts: any[] }>();

    for (const meetingType of meetingTypes) {
      const slots = await this.slotsForMeetingType(meetingType, date);
      for (const slot of slots) {
        const existing = byStart.get(slot.startTime);
        const host = {
          userId: meetingType.userId,
          meetingTypeId: meetingType.id,
          name:
            `${meetingType.user?.firstName ?? ''} ${meetingType.user?.lastName ?? ''}`.trim() ||
            'Coleg',
        };
        if (existing) existing.hosts.push(host);
        else byStart.set(slot.startTime, { ...slot, hosts: [host] });
      }
    }

    return [...byStart.values()].sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  private async slotsForMeetingType(meetingType: MeetingType, date: Date) {
    // Get user's availability for the day of week
    const dayOfWeek = this.getDayOfWeek(date);
    const availabilities = await this.availabilityRepository.find({
      where: {
        userId: meetingType.userId,
        dayOfWeek,
        isActive: true,
        deletedAt: null as any,
      },
    });

    if (availabilities.length === 0) {
      return [];
    }

    // Get existing bookings for that day
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const bookings = await this.bookingRepository.find({
      where: {
        hostId: meetingType.userId,
        startTime: Between(startOfDay, endOfDay),
        status: BookingStatus.CONFIRMED,
        deletedAt: null as any,
      },
      order: { startTime: 'ASC' },
    });

    // Generate available slots
    const slots = [];
    const now = new Date();
    const minBookingTime = new Date(now.getTime() + meetingType.minNoticeHours * 60 * 60 * 1000);

    for (const availability of availabilities) {
      const [startHour, startMinute] = availability.startTime.split(':').map(Number);
      const [endHour, endMinute] = availability.endTime.split(':').map(Number);

      let currentSlot = new Date(date);
      currentSlot.setHours(startHour, startMinute, 0, 0);

      const endTime = new Date(date);
      endTime.setHours(endHour, endMinute, 0, 0);

      while (currentSlot < endTime) {
        const slotEnd = new Date(currentSlot.getTime() + meetingType.duration * 60000);

        // Check if slot is in the future (with min notice)
        if (currentSlot < minBookingTime) {
          currentSlot = new Date(currentSlot.getTime() + 15 * 60000); // 15 min intervals
          continue;
        }

        // Check if slot doesn't exceed end time
        if (slotEnd > endTime) {
          break;
        }

        // Check for conflicts with existing bookings
        const hasConflict = bookings.some(booking => {
          const bookingStart = new Date(booking.startTime);
          const bookingEnd = new Date(booking.endTime);
          return (
            (currentSlot >= bookingStart && currentSlot < bookingEnd) ||
            (slotEnd > bookingStart && slotEnd <= bookingEnd) ||
            (currentSlot <= bookingStart && slotEnd >= bookingEnd)
          );
        });

        if (!hasConflict) {
          slots.push({
            startTime: currentSlot.toISOString(),
            endTime: slotEnd.toISOString(),
            duration: meetingType.duration,
          });
        }

        currentSlot = new Date(currentSlot.getTime() + 15 * 60000); // 15 min intervals
      }
    }

    return slots;
  }

  // ========== Bookings ==========

  /**
   * "I cannot decide — call me."
   *
   * The lead lands in the same place a Typeform lead who never booked lands:
   * a contact with no booking at all, which is exactly what the De sunat
   * queue selects. Nothing marks them specially, because nothing needs to —
   * the absence of a booking is the signal.
   */
  async requestCallback(
    slug: string,
    dto: { name: string; phone: string; email?: string; notes?: string },
  ): Promise<{ contactId: string; alerted: number }> {
    const entry = await this.getMeetingTypeBySlug(slug);
    const workspaceId = entry.workspaceId;

    const [firstName, ...rest] = String(dto.name || '').trim().split(/\s+/);
    const digits = String(dto.phone || '').replace(/\D/g, '') || Date.now().toString();

    let contact: any;
    try {
      contact = await this.contactsService.create(workspaceId, {
        firstName: firstName || dto.phone,
        lastName: rest.join(' ') || '-',
        // The DTO insists on an address and most of these people give only a
        // number, so one is minted the way the Typeform and Meta paths do.
        email: dto.email?.trim() || `callback.${digits}@booking.placeholder.invalid`,
        phone: dto.phone,
        status: ContactStatus.LEAD,
        source: ContactSource.WEBSITE,
        tags: ['callback'],
        notes: dto.notes?.trim() || 'A cerut să fie sunat pentru programare.',
      } as any);
    } catch (err: any) {
      // Asking twice is not an error. They are already in the CRM, and the
      // team still needs telling that they are waiting for a call.
      if (err?.status !== 409) throw err;
      // create() refuses a duplicate for a non-external source, so the person
      // is found the way the leads list finds them: by searching the number.
      const found = await this.contactsService.findAll(workspaceId, {
        search: dto.phone,
        limit: 1,
      } as any);
      contact = found?.contacts?.[0];
      if (!contact) throw err;
    }

    const alerted = await this.alertCallers(workspaceId, contact);
    return { contactId: contact.id, alerted };
  }

  /**
   * Everyone who works the phone hears about it, not the whole workspace:
   * this is a job for whoever picks it up, not news for the accountant.
   */
  private async alertCallers(workspaceId: string, contact: any): Promise<number> {
    const team = await this.userRepository.find({
      where: [
        { workspaceId, status: UserStatus.ACTIVE, role: UserRole.CALLER },
        { workspaceId, status: UserStatus.ACTIVE, role: UserRole.CLOSER },
      ],
      select: ['id'],
    });

    const name = `${contact.firstName ?? ''} ${contact.lastName === '-' ? '' : contact.lastName ?? ''}`.trim();
    const message = `${name || contact.phone} cere să fie sunat pentru programare.`;

    await Promise.all(
      team.map((user) =>
        this.notificationsService
          .create(workspaceId, {
            type: NotificationType.LEAD,
            userId: user.id,
            title: 'Cerere de contactare',
            message,
            link: `/leads/${contact.id}`,
            metadata: { contactId: contact.id, reason: 'callback-request' },
          })
          // One push failing must not lose the lead that was just written.
          .catch((err) => this.logger.warn(`Callback alert failed for ${user.id}: ${err?.message}`)),
      ),
    );

    return team.length;
  }

  async createBooking(dto: CreateBookingDto) {
    const meetingType = await this.meetingTypeRepository.findOne({
      where: { id: dto.meetingTypeId, isActive: true, deletedAt: null as any },
    });

    if (!meetingType) {
      throw new NotFoundException('Meeting type not found or not available');
    }

    const startTime = new Date(dto.startTime);
    const endTime = new Date(startTime.getTime() + meetingType.duration * 60000);

    // Check if slot is still available
    const existingBooking = await this.bookingRepository.findOne({
      where: {
        hostId: meetingType.userId,
        startTime: Between(
          new Date(startTime.getTime() - meetingType.duration * 60000),
          endTime,
        ),
        status: BookingStatus.CONFIRMED,
        deletedAt: null as any,
      },
    });

    if (existingBooking) {
      throw new BadRequestException('This time slot is no longer available');
    }

    // Check or create contact
    let contactId = null;
    const existingContact = await this.contactRepository.findOne({
      where: {
        email: dto.guestEmail.toLowerCase(),
        workspaceId: meetingType.workspaceId,
        deletedAt: null as any,
      },
    });

    if (existingContact) {
      contactId = existingContact.id;
    }

    const booking = this.bookingRepository.create({
      ...dto,
      workspaceId: meetingType.workspaceId,
      hostId: meetingType.userId,
      meetingTypeId: meetingType.id,
      contactId,
      startTime,
      endTime,
      duration: meetingType.duration,
      locationType: meetingType.locationType,
      location: meetingType.location,
      status: BookingStatus.CONFIRMED,
    });

    const saved = await this.bookingRepository.save(booking);
    await this.notifyHostOfBooking(saved, meetingType, dto);
    return saved;
  }

  /**
   * Only the host is told. They are the one who has to take the call, and a
   * workspace-wide ping for every booking is how three notifications arrive
   * for one lead. A failed push must never lose a booking the guest has
   * already completed, so this swallows its own errors.
   */
  private async notifyHostOfBooking(
    booking: Booking,
    meetingType: MeetingType,
    dto: CreateBookingDto,
  ): Promise<void> {
    if (!booking.hostId) return;

    const guest = String(dto.guestName || '').trim() || dto.guestEmail;
    const when = new Intl.DateTimeFormat('ro-RO', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Europe/Bucharest',
    }).format(booking.startTime);

    try {
      await this.notificationsService.create(meetingType.workspaceId, {
        type: NotificationType.MEETING,
        userId: booking.hostId,
        title: 'Lead programat',
        message: `${guest} — ${meetingType.name} pe ${when}`,
        link: booking.contactId ? `/leads/${booking.contactId}` : '/calendar',
        metadata: { bookingId: booking.id, contactId: booking.contactId },
      });
    } catch (err: any) {
      this.logger.warn(`Booking notification failed for ${booking.id}: ${err?.message}`);
    }
  }

  async getBookings(workspaceId: string, userId?: string, startDate?: Date, endDate?: Date) {
    const where: any = { workspaceId, deletedAt: null as any };

    if (userId) {
      where.hostId = userId;
    }

    if (startDate && endDate) {
      where.startTime = Between(startDate, endDate);
    }

    return this.bookingRepository.find({
      where,
      relations: ['host', 'meetingType', 'contact'],
      order: { startTime: 'ASC' },
    });
  }

  async getBookingByConfirmation(confirmationCode: string) {
    const booking = await this.bookingRepository.findOne({
      where: { confirmationCode, deletedAt: null as any },
      relations: ['host', 'meetingType'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    return booking;
  }

  async cancelBooking(confirmationCode: string, reason?: string) {
    const booking = await this.getBookingByConfirmation(confirmationCode);

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Booking is already cancelled');
    }

    booking.status = BookingStatus.CANCELLED;
    booking.cancellationReason = reason;
    booking.cancelledAt = new Date();

    return this.bookingRepository.save(booking);
  }

  async rescheduleBooking(confirmationCode: string, newStartTime: Date) {
    const booking = await this.getBookingByConfirmation(confirmationCode);

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Cannot reschedule a cancelled booking');
    }

    const endTime = new Date(newStartTime.getTime() + booking.duration * 60000);

    // Check if new slot is available
    const conflictBooking = await this.bookingRepository.findOne({
      where: {
        hostId: booking.hostId,
        id: Not(booking.id),
        startTime: Between(
          new Date(newStartTime.getTime() - booking.duration * 60000),
          endTime,
        ),
        status: BookingStatus.CONFIRMED,
        deletedAt: null as any,
      },
    });

    if (conflictBooking) {
      throw new BadRequestException('This time slot is not available');
    }

    booking.startTime = newStartTime;
    booking.endTime = endTime;

    return this.bookingRepository.save(booking);
  }

  // ========== Helper Methods ==========

  private getDayOfWeek(date: Date): DayOfWeek {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getDay()] as DayOfWeek;
  }
}
