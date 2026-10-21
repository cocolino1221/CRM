import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Booking, BookingStatus } from '../database/entities/booking.entity';
import { Availability } from '../database/entities/availability.entity';
import { User } from '../database/entities/user.entity';
import { canManageBooking } from './booking-permissions';
import { CALENDAR_ROLES, canHostMeetings, hasTimeOfDay } from './calendar-access';
import { BookingMeetingsService } from './booking-meetings.service';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectRepository(Booking)
    private bookingRepository: Repository<Booking>,
    @InjectRepository(Availability)
    private availabilityRepository: Repository<Availability>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @Optional() private readonly meetings?: BookingMeetingsService,
  ) {}

  async findAll(workspaceId: string, filters?: {
    hostId?: string;
    /** Only bookings of leads this caller/setter is tagged on (or hosts). */
    assignedTo?: string;
    status?: BookingStatus;
    startDate?: Date;
    endDate?: Date;
  }) {
    const queryBuilder = this.bookingRepository
      .createQueryBuilder('booking')
      .leftJoinAndSelect('booking.host', 'host')
      .leftJoinAndSelect('booking.contact', 'contact')
      .leftJoinAndSelect('booking.meetingType', 'meetingType')
      .where('booking.workspaceId = :workspaceId', { workspaceId })
      .andWhere('booking.deletedAt IS NULL');

    if (filters?.hostId) {
      queryBuilder.andWhere('booking.hostId = :hostId', { hostId: filters.hostId });
    }

    if (filters?.assignedTo) {
      queryBuilder.andWhere(
        '(contact.callerId = :me OR contact.setterId = :me OR booking.hostId = :me)',
        { me: filters.assignedTo },
      );
    }

    if (filters?.status) {
      queryBuilder.andWhere('booking.status = :status', { status: filters.status });
    }

    if (filters?.startDate && filters?.endDate) {
      queryBuilder.andWhere('booking.startTime BETWEEN :startDate AND :endDate', {
        startDate: filters.startDate,
        endDate: filters.endDate,
      });
    }

    queryBuilder.orderBy('booking.startTime', 'ASC');

    return queryBuilder.getMany();
  }

  async findAvailableSlots(workspaceId: string, hostId: string, date: Date) {
    // Get user availability for the day
    const dayOfWeek = this.getDayOfWeek(date) as any;
    const availabilities = await this.availabilityRepository.find({
      where: {
        workspaceId,
        userId: hostId,
        dayOfWeek,
        isActive: true,
        deletedAt: null as any,
      },
    });

    if (availabilities.length === 0) {
      return [];
    }

    // Get existing bookings for the date
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const existingBookings = await this.bookingRepository.find({
      where: {
        workspaceId,
        hostId,
        startTime: Between(startOfDay, endOfDay),
        status: BookingStatus.CONFIRMED,
        deletedAt: null,
      },
    });

    // Generate available slots
    const slots = [];
    for (const availability of availabilities) {
      const [startHour, startMin] = availability.startTime.split(':').map(Number);
      const [endHour, endMin] = availability.endTime.split(':').map(Number);

      // Generate 30-minute slots
      let currentTime = startHour * 60 + startMin;
      const endTime = endHour * 60 + endMin;

      while (currentTime + 30 <= endTime) {
        const slotStart = new Date(date);
        slotStart.setHours(Math.floor(currentTime / 60), currentTime % 60, 0, 0);

        const slotEnd = new Date(slotStart);
        slotEnd.setMinutes(slotEnd.getMinutes() + 30);

        // Check if slot is not booked
        const isBooked = existingBookings.some(booking => {
          return (
            (slotStart >= booking.startTime && slotStart < booking.endTime) ||
            (slotEnd > booking.startTime && slotEnd <= booking.endTime) ||
            (slotStart <= booking.startTime && slotEnd >= booking.endTime)
          );
        });

        if (!isBooked && slotStart > new Date()) {
          slots.push({
            startTime: slotStart,
            endTime: slotEnd,
            available: true,
          });
        }

        currentTime += 30;
      }
    }

    return slots;
  }

  async create(
    workspaceId: string,
    bookedBy: User,
    dto: {
      hostId: string;
      startTime: Date;
      duration: number; // in minutes
      contactId?: string;
      guestName?: string;
      guestEmail?: string;
      guestPhone?: string;
      notes?: string;
      timezone?: string;
      /** 'google_meet' | 'zoom' | 'none'; empty = the closer's preference. */
      meetingProvider?: string;
    },
  ) {
    // Validate that booker has permission
    this.validateBookingPermission(bookedBy, dto.hostId);

    // Over JSON startTime arrives as a string, and this body has no DTO class
    // to transform it. Unconverted it reached zonedParts as a string and threw
    // RangeError: Invalid time value — a 500 on every manual booking.
    const startTime = dto.startTime instanceof Date ? dto.startTime : new Date(dto.startTime);
    if (Number.isNaN(startTime.getTime())) {
      throw new BadRequestException('startTime is not a valid date');
    }

    // A date with no hour ("2026-10-24") passes every date check and stores
    // midnight UTC, which the app shows as 03:00 Bucharest: an appointment
    // nobody chose, indistinguishable from one somebody did.
    if (!(dto.startTime instanceof Date) && !hasTimeOfDay(dto.startTime as any)) {
      throw new BadRequestException('startTime must include the hour of the meeting');
    }

    // Validate host exists
    const host = await this.userRepository.findOne({
      where: { id: dto.hostId, workspaceId },
    });

    if (!host) {
      throw new NotFoundException('Host not found');
    }

    // Only the people who work the calendar may be put in it. An account that
    // administers the workspace takes no meetings, so a lead booked with one
    // is a lead nobody turns up for.
    if (!canHostMeetings(host)) {
      throw new BadRequestException(
        `That colleague does not work the calendar. Only ${CALENDAR_ROLES.join(', ')} can be booked.`,
      );
    }

    // Calculate end time
    const endTime = new Date(startTime);
    endTime.setMinutes(endTime.getMinutes() + dto.duration);

    // Check if slot is available
    const isAvailable = await this.isSlotAvailable(
      workspaceId,
      dto.hostId,
      startTime,
      endTime,
    );

    if (!isAvailable) {
      throw new BadRequestException('Time slot is not available');
    }

    // A closer putting a meeting in their own diary may pick any hour: the
    // declared hours are what the team and the public page may book, not a
    // cage for the closer. Overlap above still applies to everyone.
    const selfBooked = dto.hostId === bookedBy.id;
    const withinHours =
      selfBooked ||
      (await this.isWithinAvailability(workspaceId, dto.hostId, startTime, endTime));

    if (!withinHours) {
      throw new BadRequestException('That hour is outside this host\'s working hours');
    }

    // Create booking
    const { meetingProvider, ...bookingFields } = dto;
    const booking = this.bookingRepository.create({
      ...bookingFields,
      workspaceId,
      startTime,
      endTime,
      timezone: dto.timezone || 'UTC',
      status: BookingStatus.CONFIRMED,
    });

    const saved = await this.bookingRepository.save(booking);

    this.logger.log(`Booking created: ${saved.id} for host ${dto.hostId} by ${bookedBy.id}`);

    // Meet/Zoom link + email to the lead and the closer. Never fails the booking.
    const meeting = await this.meetings?.setUpMeeting(saved.id, meetingProvider);

    const created = await this.bookingRepository.findOne({
      where: { id: saved.id },
      relations: ['host', 'contact', 'meetingType'],
    });
    return meeting ? { ...created, meeting } : created;
  }

  async cancel(workspaceId: string, id: string, userId: string, reason?: string) {
    // No host relation: a deleted closer loads as host: null, and saving that
    // writes hostId = NULL, which Postgres refuses — the booking could never
    // be cancelled.
    const booking = await this.bookingRepository.findOne({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!canManageBooking(user, booking)) {
      throw new ForbiddenException('Doar closerul programării o poate anula.');
    }

    booking.status = BookingStatus.CANCELLED;
    booking.cancellationReason = reason;
    booking.cancelledAt = new Date();

    await this.bookingRepository.save(booking);
    await this.meetings?.cancelMeeting(booking);

    this.logger.log(`Booking ${id} cancelled by ${userId}`);

    return booking;
  }

  async updateStatus(workspaceId: string, id: string, status: BookingStatus, actor?: { id?: string; role?: string }) {
    const booking = await this.bookingRepository.findOne({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Any closer could mark any other closer's meeting held or no-show.
    if (!canManageBooking(actor, booking)) {
      throw new ForbiddenException('Doar closerul programării îi poate schimba statusul.');
    }

    booking.status = status;
    await this.bookingRepository.save(booking);
    if (status === BookingStatus.CANCELLED) await this.meetings?.cancelMeeting(booking);

    this.logger.log(`Booking ${id} status updated to ${status}`);

    return this.bookingRepository.findOne({
      where: { id },
      relations: ['host', 'contact', 'meetingType'],
    });
  }

  /**
   * Moves a booking to another hour with the same closer and length. The new
   * hour is held to the same rules as a new booking — free, inside the
   * closer's hours, not in the past — except that the booking does not
   * collide with itself.
   */
  async reschedule(
    workspaceId: string,
    id: string,
    actor: { id?: string; role?: string },
    startTimeInput: string | Date,
  ) {
    const booking = await this.bookingRepository.findOne({
      where: { id, workspaceId, deletedAt: null },
    });
    if (!booking) {
      throw new NotFoundException('Booking not found');
    }
    if (!canManageBooking(actor, booking)) {
      throw new ForbiddenException('Doar closerul programării o poate muta.');
    }
    if (booking.status !== BookingStatus.CONFIRMED) {
      throw new BadRequestException('Doar o programare confirmată poate fi mutată.');
    }

    const startTime = startTimeInput instanceof Date ? startTimeInput : new Date(startTimeInput);
    if (Number.isNaN(startTime.getTime())) {
      throw new BadRequestException('startTime is not a valid date');
    }
    if (startTime.getTime() <= Date.now()) {
      throw new BadRequestException('Ora nouă trebuie să fie în viitor.');
    }

    const length =
      booking.duration ||
      Math.round((new Date(booking.endTime).getTime() - new Date(booking.startTime).getTime()) / 60000) ||
      30;
    const endTime = new Date(startTime.getTime() + length * 60000);

    if (!(await this.isSlotAvailable(workspaceId, booking.hostId, startTime, endTime, booking.id))) {
      throw new BadRequestException('Closerul are deja o programare la ora aceea.');
    }
    if (!(await this.isWithinAvailability(workspaceId, booking.hostId, startTime, endTime))) {
      throw new BadRequestException('Ora aleasă este în afara programului closerului.');
    }

    const from = booking.startTime;
    booking.startTime = startTime;
    booking.endTime = endTime;
    // A new time deserves its own reminder.
    booking.hostRemindedAt = null;
    await this.bookingRepository.save(booking);
    await this.meetings?.moveMeeting(booking);
    this.logger.log(`Booking ${id} moved from ${new Date(from).toISOString()} to ${startTime.toISOString()} by ${actor.id}`);

    return this.bookingRepository.findOne({
      where: { id },
      relations: ['host', 'contact', 'meetingType'],
    });
  }

  /** Minutes since midnight for an "HH:MM" (or "HH:MM:SS") column. */
  private static toMinutes(value: string): number {
    const [h, m] = String(value || '').slice(0, 5).split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  /** The weekday and the time of day of a moment, as read in a given zone. */
  private zonedParts(date: Date, timeZone: string): { weekday: string; minutes: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';

    return {
      weekday: part('weekday').toLowerCase(),
      minutes: Number(part('hour')) * 60 + Number(part('minute')),
    };
  }

  /**
   * Whether the host actually works then.
   *
   * Overlap was always checked; the hours themselves never were, so a caller
   * could put a lead down for 03:00 on a Sunday. A host who has declared no
   * hours at all is left alone on purpose: every closer had an empty week
   * until the availability screen existed, and enforcing hours nobody has set
   * would have stopped manual booking everywhere at once.
   */
  private async isWithinAvailability(
    workspaceId: string,
    hostId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<boolean> {
    const rows = await this.availabilityRepository.find({
      where: { workspaceId, userId: hostId },
    });
    // Zero rows means the host never configured a week. A row switched off is
    // the opposite: a deliberate "not then", which must still be enforced.
    if (rows.length === 0) return true;
    const active = rows.filter((row) => row.isActive !== false);

    return active.some((row) => {
      const zone = row.timezone || 'UTC';
      const start = this.zonedParts(startTime, zone);
      const end = this.zonedParts(endTime, zone);

      if (start.weekday !== String(row.dayOfWeek)) return false;
      // A meeting running past midnight cannot sit inside one day's window.
      if (end.minutes <= start.minutes) return false;

      return (
        start.minutes >= BookingsService.toMinutes(row.startTime) &&
        end.minutes <= BookingsService.toMinutes(row.endTime)
      );
    });
  }

  private async isSlotAvailable(
    workspaceId: string,
    hostId: string,
    startTime: Date,
    endTime: Date,
    /** A booking being moved must not count as its own conflict. */
    excludeId?: string,
  ): Promise<boolean> {
    // Check for overlapping bookings
    const overlapping = await this.bookingRepository
      .createQueryBuilder('booking')
      .where('booking.workspaceId = :workspaceId', { workspaceId })
      .andWhere(excludeId ? 'booking.id != :excludeId' : '1=1', { excludeId })
      .andWhere('booking.hostId = :hostId', { hostId })
      .andWhere('booking.status = :status', { status: BookingStatus.CONFIRMED })
      .andWhere('booking.deletedAt IS NULL')
      .andWhere(
        '(booking.startTime < :endTime AND booking.endTime > :startTime)',
        { startTime, endTime },
      )
      .getCount();

    return overlapping === 0;
  }

  private validateBookingPermission(user: User, hostId: string) {
    const allowedRoles = ['super_admin', 'admin', 'manager', 'setter', 'caller'];
    // A closer books only into their own diary, never a colleague's.
    const closerForSelf = user.role === 'closer' && hostId === user.id;
    if (!allowedRoles.includes(user.role) && !closerForSelf) {
      throw new ForbiddenException('You do not have permission to create bookings');
    }
  }

  private getDayOfWeek(date: Date): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getDay()];
  }
}
