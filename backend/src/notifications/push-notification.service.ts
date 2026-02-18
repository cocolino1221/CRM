import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';
import { DeviceToken } from '../database/entities/device-token.entity';
import { User } from '../database/entities/user.entity';
import { NotificationType } from '../database/entities/notification.entity';

@Injectable()
export class PushNotificationService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationService.name);
  private firebaseInitialized = false;

  constructor(
    @InjectRepository(DeviceToken)
    private deviceTokenRepository: Repository<DeviceToken>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
  ) {}

  onModuleInit() {
    const serviceAccountJson = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT');
    if (!serviceAccountJson) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT not set — push notifications disabled');
      return;
    }
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      this.firebaseInitialized = true;
      this.logger.log('Firebase Admin initialized for push notifications');
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Admin: ' + err.message);
    }
  }

  private getPreferenceKey(type: NotificationType): string | null {
    const map: Record<string, string> = {
      [NotificationType.LEAD]: 'newLead',
      [NotificationType.TASK]: 'taskAssigned',
      [NotificationType.MEETING]: 'meetingReminder',
      [NotificationType.CALL]: 'newLead',
      [NotificationType.WHATSAPP]: 'newLead',
      [NotificationType.EMAIL]: 'newLead',
      [NotificationType.SYSTEM]: 'teamMention',
    };
    return map[type] || null;
  }

  async sendPushToUser(
    userId: string,
    notification: {
      type: NotificationType;
      title: string;
      message: string;
      link?: string;
      notificationId?: string;
    },
  ): Promise<void> {
    if (!this.firebaseInitialized) return;

    // Check user push preferences
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'preferences'],
    });
    if (!user) return;

    const prefKey = this.getPreferenceKey(notification.type);
    if (prefKey) {
      const pushPrefs = (user.preferences as any)?.notifications?.push;
      if (pushPrefs && pushPrefs[prefKey] === false) {
        return;
      }
    }

    // Get active device tokens
    const tokens = await this.deviceTokenRepository.find({
      where: { userId, isActive: true },
    });
    if (tokens.length === 0) return;

    const fcmTokens = tokens.map((t) => t.token);

    try {
      const response = await admin.messaging().sendEachForMulticast({
        tokens: fcmTokens,
        notification: {
          title: notification.title,
          body: notification.message,
        },
        data: {
          type: notification.type,
          link: notification.link || '',
          notificationId: notification.notificationId || '',
        },
        apns: {
          payload: { aps: { sound: 'default', badge: 1 } },
        },
        android: {
          priority: 'high',
          notification: { sound: 'default', channelId: 'crm_notifications' },
        },
      });

      // Mark stale tokens as inactive
      response.responses.forEach((resp, idx) => {
        if (
          !resp.success &&
          resp.error?.code === 'messaging/registration-token-not-registered'
        ) {
          this.deviceTokenRepository.update(
            { token: fcmTokens[idx] },
            { isActive: false },
          );
        }
      });

      const successCount = response.responses.filter((r) => r.success).length;
      if (successCount > 0) {
        this.logger.debug(
          `Push sent to ${successCount}/${fcmTokens.length} devices for user ${userId}`,
        );
      }
    } catch (err) {
      this.logger.error(`Push failed for user ${userId}: ${err.message}`);
    }
  }
}
