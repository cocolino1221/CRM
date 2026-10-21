import { Injectable, NotFoundException, BadRequestException, Logger, Optional } from '@nestjs/common';
import { BookingMeetingsService } from '../bookings/booking-meetings.service';
import { canHostMeetings } from '../bookings/calendar-access';
import { isSlotBookable, LEAD_BOOKING, LEAD_MIN_NOTICE_HOURS, type LeadTimeOptions } from './booking-lead-time';
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
import { BookingFormService } from './booking-form.service';
import { answeredPairs, answersAsNotes, bookingFormError } from './booking-form';
import { withAnswerNotes } from '../contacts/contact-notes';
import { blockedDaysOf, hostZoneOf, isBlockedAt, normalizeBlockedDays } from './blocked-days';
import { cleanTracking, sourceFromTracking, type BookingTracking } from './booking-source';

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
    @Optional() private readonly meetings?: BookingMeetingsService,
    @Optional() private readonly bookingForms?: BookingFormService,
  ) {}

  // ========== Days off ==========

  async getBlockedDays(workspaceId: string, userId: string): Promise<string[]> {
    const user = await this.userRepository.findOne({ where: { id: userId, workspaceId } });
    return normalizeBlockedDays(blockedDaysOf(user));
  }

  /** Replaces the host's list of whole days off. */
  async setBlockedDays(workspaceId: string, userId: string, days: unknown): Promise<string[]> {
    const user = await this.userRepository.findOne({ where: { id: userId, workspaceId } });
    if (!user) throw new NotFoundException('User not found');
    const blockedDays = normalizeBlockedDays(days);
    await this.userRepository.update(
      { id: userId, workspaceId },
      { preferences: { ...(user.preferences ?? {}), blockedDays } },
    );
    this.logger.log(`Blocked days set for ${userId}: ${blockedDays.length}`);
    return blockedDays;
  }

  /** True when `at` lands on a day the host blocked, read in the host's zone. */
  private async isHostDayBlocked(hostId: string, at: Date): Promise<boolean> {
    const host = await this.userRepository.findOne({ where: { id: hostId } });
    const days = blockedDaysOf(host);
    if (!days.length) return false;
    const rows = await this.availabilityRepository.find({ where: { userId: hostId, deletedAt: null as any } });
    return isBlockedAt(days, at, hostZoneOf(rows));
  }

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

  /**
   * Everyone in the workspace may edit their own hours, so the owner is part
   * of what is looked up: without it any of them could move or delete a
   * colleague's window by id, and the lead would be offered an hour that
   * colleague never agreed to. A row that belongs to someone else reads as
   * absent rather than forbidden — there is nothing here to tell them about.
   */
  async updateAvailability(
    workspaceId: string,
    userId: string,
    id: string,
    dto: Partial<CreateAvailabilityDto>,
  ) {
    const availability = await this.availabilityRepository.findOne({
      where: { id, workspaceId, userId, deletedAt: null as any },
    });

    if (!availability) {
      throw new NotFoundException('Availability not found');
    }

    Object.assign(availability, dto);
    return this.availabilityRepository.save(availability);
  }

  async deleteAvailability(workspaceId: string, userId: string, id: string) {
    const result = await this.availabilityRepository.softDelete({ id, workspaceId, userId });
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
    let meetingType = await this.meetingTypeRepository.findOne({
      where: { slug, isActive: true, isPublic: true, deletedAt: null as any },
      relations: ['user'],
    });

    // A form redirect written as ".../book/consultatie-h5fxc0{{email}}{{phone}}"
    // (no "?email=") glues the answers onto the slug. Slugs are [a-z0-9-] only,
    // so anything else marks the glue: find the real slug it starts with.
    if (!meetingType && /[^a-z0-9-]/.test(slug)) {
      meetingType = await this.meetingTypeRepository
        .createQueryBuilder('mt')
        .leftJoinAndSelect('mt.user', 'user')
        .where('mt.isActive = true AND mt.isPublic = true AND mt.deletedAt IS NULL')
        .andWhere(`:raw LIKE mt.slug || '%'`, { raw: slug })
        .orderBy('length(mt.slug)', 'DESC')
        .getOne();
    }

    if (!meetingType) {
      throw new NotFoundException('Meeting type not found');
    }

    return meetingType;
  }

  /**
   * Owner-scoped for the same reason as availability: the meeting type holds
   * the duration and the step a person's hours are offered in, and the hours
   * screen writes one on every save.
   */
  async updateMeetingType(
    workspaceId: string,
    userId: string,
    id: string,
    dto: Partial<CreateMeetingTypeDto>,
  ) {
    const meetingType = await this.meetingTypeRepository.findOne({
      where: { id, workspaceId, userId, deletedAt: null as any },
    });

    if (!meetingType) {
      throw new NotFoundException('Meeting type not found');
    }

    Object.assign(meetingType, dto);
    return this.meetingTypeRepository.save(meetingType);
  }

  async deleteMeetingType(workspaceId: string, userId: string, id: string) {
    const result = await this.meetingTypeRepository.softDelete({ id, workspaceId, userId });
    if (result.affected === 0) {
      throw new NotFoundException('Meeting type not found');
    }
  }

  // ========== Available Slots ==========

  async getAvailableSlots(slug: string, date: Date, timezone: string = 'UTC', now: Date = new Date()) {
    const meetingType = await this.getMeetingTypeBySlug(slug);
    const slots = await this.slotsForMeetingType(meetingType, date);
    // Public page: the lead needs to leave the team three hours' warning.
    return slots.filter((slot) => isSlotBookable(new Date(slot.startTime), now, undefined, LEAD_BOOKING));
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
  async getTeamSlots(slug: string, date: Date, now: Date = new Date()) {
    const entry = await this.getMeetingTypeBySlug(slug);
    return this.getTeamSlotsForWorkspace(entry.workspaceId, date, now, LEAD_BOOKING);
  }

  /**
   * The same free hours, for someone already signed in — the app books from
   * here, where there is no public slug to resolve a workspace from.
   *
   * Hours that break the lead-time rule are dropped rather than returned and
   * hidden: a client is free to ignore a flag, and the booking endpoint would
   * then accept what the screen should never have offered.
   */
  async getTeamSlotsForWorkspace(
    workspaceId: string,
    date: Date,
    now: Date = new Date(),
    leadTime: LeadTimeOptions = {},
  ) {
    const meetingTypes = await this.meetingTypeRepository.find({
      where: { workspaceId, isActive: true, isPublic: true, deletedAt: null as any },
      relations: ['user'],
    });

    const byStart = new Map<string, { startTime: string; endTime: string; duration: number; hosts: any[] }>();

    for (const meetingType of meetingTypes) {
      // A meeting type outlives the person who owns it: deleting a user leaves
      // their row behind, and TypeORM will not load a soft-deleted relation.
      // Without this a lead is offered an hour with someone who has left.
      if (!meetingType.user) continue;

      // It also outlives what the account is for: an admin account in this
      // workspace carries ten public meeting types. Offering it as free puts a
      // lead in front of someone who takes no meetings, and POST /bookings now
      // refuses that host — so the hour must not be offered either.
      if (!canHostMeetings(meetingType.user)) continue;

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

    return [...byStart.values()]
      .filter((slot) => isSlotBookable(new Date(slot.startTime), now, undefined, leadTime))
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  private async slotsForMeetingType(meetingType: MeetingType, date: Date) {
    // The date arrives as YYYY-MM-DD parsed to UTC midnight. Reading it with
    // local getters would shift the day on any server not running in UTC.
    const ymd = date.toISOString().slice(0, 10);
    const dayOfWeek = this.getDayOfWeek(new Date(`${ymd}T12:00:00Z`));
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

    // A whole day the closer took off: nothing to offer.
    const host = await this.userRepository.findOne({ where: { id: meetingType.userId } });
    if (blockedDaysOf(host).includes(ymd)) {
      return [];
    }

    // The closer's day can start up to 14h either side of UTC midnight, so the
    // bookings window is widened by a day each way; the overlap check below is
    // exact.
    const dayStart = new Date(`${ymd}T00:00:00Z`).getTime();
    const bookings = await this.bookingRepository.find({
      where: {
        hostId: meetingType.userId,
        startTime: Between(new Date(dayStart - 86400000), new Date(dayStart + 2 * 86400000)),
        status: BookingStatus.CONFIRMED,
        deletedAt: null as any,
      },
      order: { startTime: 'ASC' },
    });

    const step = [15, 30, 60].includes(meetingType.slotInterval) ? meetingType.slotInterval : 15;
    const slots = [];
    const minBookingTime = new Date(Date.now() + meetingType.minNoticeHours * 60 * 60 * 1000);

    for (const availability of availabilities) {
      // Hours were typed in the closer's clock, not the server's: 09:00 in
      // Bucharest has to be offered as 09:00 Bucharest.
      const zone = availability.timezone || 'UTC';
      let currentSlot = SchedulingService.zonedToUtc(ymd, availability.startTime, zone);
      const endTime = SchedulingService.zonedToUtc(ymd, availability.endTime, zone);

      while (currentSlot < endTime) {
        const slotEnd = new Date(currentSlot.getTime() + meetingType.duration * 60000);

        if (slotEnd > endTime) {
          break;
        }

        const tooSoon = currentSlot < minBookingTime;
        const hasConflict = bookings.some(booking => {
          const bookingStart = new Date(booking.startTime);
          const bookingEnd = new Date(booking.endTime);
          return currentSlot < bookingEnd && slotEnd > bookingStart;
        });

        if (!tooSoon && !hasConflict) {
          slots.push({
            startTime: currentSlot.toISOString(),
            endTime: slotEnd.toISOString(),
            duration: meetingType.duration,
          });
        }

        currentSlot = new Date(currentSlot.getTime() + step * 60000);
      }
    }

    return slots.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  /**
   * The UTC instant of a wall-clock HH:MM on a YYYY-MM-DD in a timezone.
   * Guesses the instant as if the zone were UTC, measures the zone's offset at
   * that guess, and corrects; a second pass settles the DST changeover days.
   */
  static zonedToUtc(ymd: string, hhmm: string, timeZone: string): Date {
    const [y, m, d] = ymd.split('-').map(Number);
    const [h, min] = hhmm.split(':').map(Number);
    const wall = Date.UTC(y, m - 1, d, h, min);

    const offsetAt = (instant: number) => {
      let parts: Intl.DateTimeFormatPart[];
      try {
        parts = new Intl.DateTimeFormat('en-US', {
          timeZone,
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hourCycle: 'h23',
        }).formatToParts(new Date(instant));
      } catch {
        return 0; // An unknown zone name falls back to UTC rather than failing the page.
      }
      const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
      const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
      return asUtc - instant;
    };

    let instant = wall - offsetAt(wall);
    instant = wall - offsetAt(instant);
    return new Date(instant);
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
    dto: { name: string; phone: string; email?: string; notes?: string; tracking?: unknown },
  ): Promise<{ contactId: string; alerted: number }> {
    const entry = await this.getMeetingTypeBySlug(slug);
    const workspaceId = entry.workspaceId;
    const tracking = cleanTracking(dto.tracking);
    const { source, label } = sourceFromTracking(tracking);

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
        source,
        tags: ['callback'],
        notes: `${dto.notes?.trim() || 'A cerut să fie sunat pentru programare.'} Sursă: ${label}.`,
        customFields: { bookingSource: { label, ...(tracking ?? {}) } },
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
   * A lead for a stranger who booked, put on the closer who will take the
   * meeting. Never blocks the booking: a lead that cannot be made leaves the
   * booking with its guest details, as before.
   */
  private async createLeadForBooking(
    workspaceId: string,
    hostId: string,
    dto: { guestName?: string; guestEmail?: string; guestPhone?: string },
    tracking: BookingTracking | null = null,
  ): Promise<Contact | null> {
    const [firstName, ...rest] = String(dto.guestName || '').trim().split(/\s+/);
    const digits = String(dto.guestPhone || '').replace(/\D/g, '') || Date.now().toString();
    // Where they came from becomes the lead's source: "Instagram · bio".
    const { source, label } = sourceFromTracking(tracking);
    try {
      return (await this.contactsService.create(workspaceId, {
        firstName: firstName || dto.guestPhone || 'Lead',
        lastName: rest.join(' ') || '-',
        email: dto.guestEmail?.trim() || `booking.${digits}@booking.placeholder.invalid`,
        phone: dto.guestPhone,
        status: ContactStatus.LEAD,
        source,
        tags: ['programare'],
        closerId: hostId,
        notes: `S-a programat singur de pe pagina de programare. Sursă: ${label}.`,
        customFields: { bookingSource: { label, ...(tracking ?? {}) } },
      } as any)) as any;
    } catch (err: any) {
      this.logger.warn(`Could not create a lead for a public booking: ${err?.message}`);
      return null;
    }
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

    // The age check and the questions: enforced here too, since the request
    // can be sent without the page.
    const form = this.bookingForms
      ? await this.bookingForms.getForLink(meetingType.workspaceId, dto.variant)
      : null;
    if (form) {
      const formError = bookingFormError(form, dto.customAnswers);
      if (formError) throw new BadRequestException(formError);
    }

    const startTime = new Date(dto.startTime);
    const endTime = new Date(startTime.getTime() + meetingType.duration * 60000);

    // The page only offers hours far enough ahead, but the request can name
    // any hour — hold it to the same rule here.
    if (!isSlotBookable(startTime, new Date(), undefined, LEAD_BOOKING)) {
      throw new BadRequestException(
        `Programarea se poate face cu cel puțin ${LEAD_MIN_NOTICE_HOURS} ore înainte. Alege o oră mai târzie.`,
      );
    }

    if (await this.isHostDayBlocked(meetingType.userId, startTime)) {
      throw new BadRequestException('Closerul nu lucrează în această zi. Alege altă zi.');
    }

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

    // The lead almost always exists already — Typeform or a WooCommerce order
    // created them. Missing them here books a stranger and leaves the real
    // lead in De sunat forever, so the match is forgiving on both keys.
    const tracking = cleanTracking(dto.tracking);
    const existingContact =
      (await this.findLeadForBooking(meetingType.workspaceId, dto.guestEmail, dto.guestPhone)) ??
      // Someone who found the link elsewhere (Instagram bio, an ad, a message)
      // is not in the CRM yet. Without a lead the booking showed as "Contact"
      // and the person never reached the leads list.
      (await this.createLeadForBooking(meetingType.workspaceId, meetingType.userId, dto, tracking));
    const contactId = existingContact?.id ?? null;

    // The answers go into the notes as plain lines, so the closer reads them
    // wherever the booking shows its notes.
    const answered = form ? answersAsNotes(form, dto.customAnswers) : '';
    const notes = [answered, dto.notes?.trim()].filter(Boolean).join('\n\n') || undefined;

    // `variant` only chose the form above; it is not a column. `tracking` is
    // stored cleaned, never as sent.
    const { variant: _variant, tracking: _tracking, ...fields } = dto;
    const booking = this.bookingRepository.create({
      ...fields,
      tracking: tracking as Record<string, string> | null,
      notes,
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

    // The answers also go on the lead's own Notes, as bullet points, so the
    // caller sees them on the contact card — not only inside the booking.
    if (contactId && form) {
      const notes = withAnswerNotes(existingContact?.notes, 'Răspunsuri la programare', answeredPairs(form, dto.customAnswers));
      if (notes) await this.contactRepository.update({ id: contactId }, { notes });
    }
    await this.notifyHostOfBooking(saved, meetingType, dto);
    // Meet/Zoom link, emailed to the lead and the closer.
    const meeting = await this.meetings?.setUpMeeting(saved.id);
    return meeting?.link ? { ...saved, location: meeting.link, locationType: meeting.provider } : saved;
  }

  /**
   * The contact a public booking belongs to: same email in any case first,
   * then the same phone however it was typed ("0749 767 923" is
   * "+40749767923"). The last nine digits are the Romanian subscriber number
   * with or without the 0 / +40 prefix.
   */
  async findLeadForBooking(workspaceId: string, email?: string, phone?: string): Promise<Contact | null> {
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (cleanEmail) {
      const byEmail = await this.contactRepository
        .createQueryBuilder('contact')
        .where('contact.workspaceId = :workspaceId', { workspaceId })
        .andWhere('contact.deletedAt IS NULL')
        .andWhere('LOWER(contact.email) = :email', { email: cleanEmail })
        .orderBy('contact.createdAt', 'DESC')
        .getOne();
      if (byEmail) return byEmail;
    }

    const digits = String(phone || '').replace(/\D/g, '');
    if (digits.length < 9) return null;
    return this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.workspaceId = :workspaceId', { workspaceId })
      .andWhere('contact.deletedAt IS NULL')
      .andWhere(`regexp_replace(contact.phone, '\\D', '', 'g') LIKE :tail`, { tail: `%${digits.slice(-9)}` })
      .orderBy('contact.createdAt', 'DESC')
      .getOne();
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

    const cancelled = await this.bookingRepository.save(booking);
    await this.meetings?.cancelMeeting(cancelled);
    return cancelled;
  }

  async rescheduleBooking(confirmationCode: string, newStartTime: Date) {
    const booking = await this.getBookingByConfirmation(confirmationCode);

    if (booking.status === BookingStatus.CANCELLED) {
      throw new BadRequestException('Cannot reschedule a cancelled booking');
    }

    if (!isSlotBookable(newStartTime, new Date(), undefined, LEAD_BOOKING)) {
      throw new BadRequestException(
        `Programarea se poate muta doar cu cel puțin ${LEAD_MIN_NOTICE_HOURS} ore înainte de noua oră.`,
      );
    }

    if (await this.isHostDayBlocked(booking.hostId, newStartTime)) {
      throw new BadRequestException('Closerul nu lucrează în această zi. Alege altă zi.');
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

    const moved = await this.bookingRepository.save(booking);
    await this.meetings?.moveMeeting(moved);
    return moved;
  }

  // ========== Helper Methods ==========

  private getDayOfWeek(date: Date): DayOfWeek {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getDay()] as DayOfWeek;
  }
}
