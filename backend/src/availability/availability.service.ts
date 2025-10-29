import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Availability, DayOfWeek } from '../database/entities/availability.entity';

@Injectable()
export class AvailabilityService {
  private readonly logger = new Logger(AvailabilityService.name);

  constructor(
    @InjectRepository(Availability)
    private availabilityRepository: Repository<Availability>,
  ) {}

  async findAll(workspaceId: string, userId?: string) {
    const query: any = { workspaceId, deletedAt: null };
    if (userId) {
      query.userId = userId;
    }

    const availabilities = await this.availabilityRepository.find({
      where: query,
      relations: ['user'],
      order: {
        userId: 'ASC',
        dayOfWeek: 'ASC',
        startTime: 'ASC',
      },
    });

    return availabilities;
  }

  async findByUser(workspaceId: string, userId: string) {
    return this.availabilityRepository.find({
      where: { workspaceId, userId, deletedAt: null },
      order: {
        dayOfWeek: 'ASC',
        startTime: 'ASC',
      },
    });
  }

  async create(workspaceId: string, userId: string, dto: {
    dayOfWeek: DayOfWeek;
    startTime: string;
    endTime: string;
    timezone?: string;
    isActive?: boolean;
  }) {
    // Validate time format and range
    this.validateTimeSlot(dto.startTime, dto.endTime);

    const availability = this.availabilityRepository.create({
      ...dto,
      workspaceId,
      userId,
      timezone: dto.timezone || 'UTC',
      isActive: dto.isActive !== undefined ? dto.isActive : true,
    });

    const saved = await this.availabilityRepository.save(availability);
    this.logger.log(`Availability created for user ${userId} on ${dto.dayOfWeek}`);

    return this.availabilityRepository.findOne({
      where: { id: saved.id },
      relations: ['user'],
    });
  }

  async update(workspaceId: string, id: string, dto: {
    dayOfWeek?: DayOfWeek;
    startTime?: string;
    endTime?: string;
    timezone?: string;
    isActive?: boolean;
  }) {
    const availability = await this.availabilityRepository.findOne({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!availability) {
      throw new NotFoundException('Availability not found');
    }

    // Validate time if provided
    const startTime = dto.startTime || availability.startTime;
    const endTime = dto.endTime || availability.endTime;
    this.validateTimeSlot(startTime, endTime);

    Object.assign(availability, dto);
    await this.availabilityRepository.save(availability);

    this.logger.log(`Availability ${id} updated`);

    return this.availabilityRepository.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  async remove(workspaceId: string, id: string) {
    const availability = await this.availabilityRepository.findOne({
      where: { id, workspaceId, deletedAt: null },
    });

    if (!availability) {
      throw new NotFoundException('Availability not found');
    }

    availability.deletedAt = new Date();
    await this.availabilityRepository.save(availability);

    this.logger.log(`Availability ${id} deleted`);
  }

  async bulkCreate(workspaceId: string, userId: string, slots: Array<{
    dayOfWeek: DayOfWeek;
    startTime: string;
    endTime: string;
    timezone?: string;
  }>) {
    // Delete existing availability for this user
    await this.availabilityRepository
      .createQueryBuilder()
      .update(Availability)
      .set({ deletedAt: new Date() })
      .where('workspaceId = :workspaceId', { workspaceId })
      .andWhere('userId = :userId', { userId })
      .andWhere('deletedAt IS NULL')
      .execute();

    // Create new availability slots
    const availabilities = slots.map(slot => {
      this.validateTimeSlot(slot.startTime, slot.endTime);
      return this.availabilityRepository.create({
        ...slot,
        workspaceId,
        userId,
        timezone: slot.timezone || 'UTC',
        isActive: true,
      });
    });

    const saved = await this.availabilityRepository.save(availabilities);
    this.logger.log(`Bulk created ${saved.length} availability slots for user ${userId}`);

    return saved;
  }

  private validateTimeSlot(startTime: string, endTime: string) {
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

    if (!timeRegex.test(startTime)) {
      throw new BadRequestException('Invalid start time format. Use HH:MM (24-hour)');
    }

    if (!timeRegex.test(endTime)) {
      throw new BadRequestException('Invalid end time format. Use HH:MM (24-hour)');
    }

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    if (startMinutes >= endMinutes) {
      throw new BadRequestException('End time must be after start time');
    }
  }
}
