import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Booking, BookingStatus } from '../database/entities/booking.entity';
import { Availability } from '../database/entities/availability.entity';
import { User } from '../database/entities/user.entity';

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
  ) {}

  async findAll(workspaceId: string, filters?: {
    hostId?: string;
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
    },
  ) {
    // Validate that booker has permission
    this.validateBookingPermission(bookedBy);

    // Validate host exists
    const host = await this.userRepository.findOne({
      where: { id: dto.hostId, workspaceId },
    });

    if (!host) {
      throw new NotFoundException('Host not found');
    }

    // Calculate end time
    const endTime = new Date(dto.startTime);
    endTime.setMinutes(endTime.getMinutes() + dto.duration);

    // Check if slot is available
    const isAvailable = await this.isSlotAvailable(
      workspaceId,
      dto.hostId,
      dto.startTime,
      endTime,
    );

    if (!isAvailable) {
      throw new BadRequestException('Time slot is not available');
    }

    // Create booking
    const booking = this.bookingRepository.create({
      ...dto,
      workspaceId,
      endTime,
      timezone: dto.timezone || 'UTC',
      status: BookingStatus.CONFIRMED,
    });

    const saved = await this.bookingRepository.save(booking);

    this.logger.log(`Booking created: ${saved.id} for host ${dto.hostId} by ${bookedBy.id}`);

    return this.bookingRepository.findOne({
      where: { id: saved.id },
      relations: ['host', 'contact', 'meetingType'],
    });
  }

  async cancel(workspaceId: string, id: string, userId: string, reason?: string) {
    const booking = await this.bookingRepository.findOne({
      where: { id, workspaceId, deletedAt: null },
      relations: ['host'],
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    // Only host or admin can cancel
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (booking.hostId !== userId && user?.role !== 'admin') {
      throw new ForbiddenException('You do not have permission to cancel this booking');
    }

    booking.status = BookingStatus.CANCELLED;
    booking.cancellationReason = reason;
    booking.cancelledAt = new Date();

    await this.bookingRepository.save(booking);

    this.logger.log(`Booking ${id} cancelled by ${userId}`);

    return booking;
  }

  async updateStatus(workspaceId: string, id: string, status: BookingStatus) {
    const booking = await this.bookingRepository.findOne({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!booking) {
      throw new NotFoundException('Booking not found');
    }

    booking.status = status;
    await this.bookingRepository.save(booking);

    this.logger.log(`Booking ${id} status updated to ${status}`);

    return this.bookingRepository.findOne({
      where: { id },
      relations: ['host', 'contact', 'meetingType'],
    });
  }

  private async isSlotAvailable(
    workspaceId: string,
    hostId: string,
    startTime: Date,
    endTime: Date,
  ): Promise<boolean> {
    // Check for overlapping bookings
    const overlapping = await this.bookingRepository
      .createQueryBuilder('booking')
      .where('booking.workspaceId = :workspaceId', { workspaceId })
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

  private validateBookingPermission(user: User) {
    const allowedRoles = ['admin', 'manager', 'setter', 'caller'];
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenException('You do not have permission to create bookings');
    }
  }

  private getDayOfWeek(date: Date): string {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getDay()];
  }
}
