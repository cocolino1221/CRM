import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from '../database/entities/notification.entity';
import { DeviceToken, DevicePlatform } from '../database/entities/device-token.entity';
import { PushNotificationService } from './push-notification.service';

export interface CreateNotificationDto {
  type: NotificationType;
  title: string;
  message: string;
  userId: string;
  link?: string;
  metadata?: Record<string, any>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private notificationRepository: Repository<Notification>,
    @InjectRepository(DeviceToken)
    private deviceTokenRepository: Repository<DeviceToken>,
    private pushNotificationService: PushNotificationService,
  ) {}

  async create(workspaceId: string, dto: CreateNotificationDto): Promise<Notification> {
    const notification = this.notificationRepository.create({
      ...dto,
      workspaceId,
    });

    const saved = await this.notificationRepository.save(notification);

    // Fire-and-forget push notification
    this.pushNotificationService
      .sendPushToUser(dto.userId, {
        type: dto.type,
        title: dto.title,
        message: dto.message,
        link: dto.link,
        notificationId: saved.id,
        metadata: dto.metadata,
      })
      .catch((err) => this.logger.error(`Push error: ${err.message}`));

    return saved;
  }

  async findAll(workspaceId: string, userId: string): Promise<Notification[]> {
    return this.notificationRepository.find({
      where: {
        workspaceId,
        userId,
      },
      order: {
        createdAt: 'DESC',
      },
      take: 50,
    });
  }

  async getUnreadCount(workspaceId: string, userId: string): Promise<number> {
    return this.notificationRepository.count({
      where: {
        workspaceId,
        userId,
        isRead: false,
      },
    });
  }

  async markAsRead(workspaceId: string, userId: string, id: string): Promise<Notification> {
    const notification = await this.notificationRepository.findOne({
      where: {
        id,
        workspaceId,
        userId,
      },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    notification.isRead = true;
    return this.notificationRepository.save(notification);
  }

  async markAllAsRead(workspaceId: string, userId: string): Promise<void> {
    await this.notificationRepository.update(
      {
        workspaceId,
        userId,
        isRead: false,
      },
      {
        isRead: true,
      },
    );
  }

  async delete(workspaceId: string, userId: string, id: string): Promise<void> {
    const result = await this.notificationRepository.delete({
      id,
      workspaceId,
      userId,
    });

    if (result.affected === 0) {
      throw new NotFoundException('Notification not found');
    }
  }

  // Device token management
  async registerDeviceToken(
    workspaceId: string,
    userId: string,
    token: string,
    platform: string,
  ): Promise<DeviceToken> {
    // Upsert: if token exists, update userId/workspace
    let existing = await this.deviceTokenRepository.findOne({ where: { token } });
    if (existing) {
      existing.userId = userId;
      existing.workspaceId = workspaceId;
      existing.isActive = true;
      return this.deviceTokenRepository.save(existing);
    }
    return this.deviceTokenRepository.save(
      this.deviceTokenRepository.create({
        workspaceId,
        userId,
        token,
        platform: platform as DevicePlatform,
        isActive: true,
      }),
    );
  }

  async removeDeviceToken(userId: string, token: string): Promise<void> {
    await this.deviceTokenRepository.delete({ userId, token });
  }

  // Helper method to create a lead assignment notification
  async notifyLeadAssignment(
    workspaceId: string,
    userId: string,
    leadName: string,
    companyName?: string,
  ): Promise<Notification> {
    return this.create(workspaceId, {
      type: NotificationType.LEAD,
      title: 'New Lead Assigned',
      message: `You have been assigned a new lead: ${leadName}${companyName ? ` from ${companyName}` : ''}`,
      userId,
      metadata: { leadName, companyName },
    });
  }

  // Helper method to create a task reminder notification
  async notifyTaskDue(
    workspaceId: string,
    userId: string,
    taskTitle: string,
    dueIn: string,
  ): Promise<Notification> {
    return this.create(workspaceId, {
      type: NotificationType.TASK,
      title: 'Task Due Soon',
      message: `${taskTitle} is due in ${dueIn}`,
      userId,
      metadata: { taskTitle, dueIn },
    });
  }

  // Helper method to create a call notification
  async notifyMissedCall(
    workspaceId: string,
    userId: string,
    phoneNumber: string,
  ): Promise<Notification> {
    return this.create(workspaceId, {
      type: NotificationType.CALL,
      title: 'Missed Call',
      message: `Missed call from ${phoneNumber}`,
      userId,
      metadata: { phoneNumber },
    });
  }
}
