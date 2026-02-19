import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as http2 from 'http2';
import * as jwt from 'jsonwebtoken';
import { DeviceToken, DevicePlatform } from '../database/entities/device-token.entity';
import { User } from '../database/entities/user.entity';
import { NotificationType } from '../database/entities/notification.entity';

@Injectable()
export class PushNotificationService implements OnModuleInit {
  private readonly logger = new Logger(PushNotificationService.name);

  // APNs direct (iOS)
  private apnsEnabled = false;
  private apnsKeyId: string;
  private apnsTeamId: string;
  private apnsKey: string;
  private apnsBundleId: string;
  private apnsProduction = true;
  private apnsToken: string | null = null;
  private apnsTokenIssuedAt = 0;

  // Firebase (Android + fallback)
  private firebaseInitialized = false;
  private firebaseAdmin: typeof import('firebase-admin') | null = null;

  constructor(
    @InjectRepository(DeviceToken)
    private deviceTokenRepository: Repository<DeviceToken>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
  ) {}

  onModuleInit() {
    this.initApns();
    this.initFirebase();

    if (!this.apnsEnabled && !this.firebaseInitialized) {
      this.logger.warn('No push notification provider configured (set APNS_KEY_ID+APNS_TEAM_ID+APNS_KEY for iOS, or FIREBASE_SERVICE_ACCOUNT for FCM)');
    }
  }

  private initApns() {
    const keyId = this.configService.get<string>('APNS_KEY_ID');
    const teamId = this.configService.get<string>('APNS_TEAM_ID');
    const key = this.configService.get<string>('APNS_KEY');

    if (!keyId || !teamId || !key) return;

    this.apnsKeyId = keyId;
    this.apnsTeamId = teamId;
    // Support both raw key and base64-encoded key
    this.apnsKey = key.includes('BEGIN PRIVATE KEY') ? key : Buffer.from(key, 'base64').toString('utf8');
    this.apnsBundleId = this.configService.get<string>('APNS_BUNDLE_ID') || 'com.easyteamcrm.app';
    this.apnsProduction = this.configService.get<string>('APNS_PRODUCTION') !== 'false';
    this.apnsEnabled = true;
    this.logger.log('APNs push notifications enabled (iOS)');
  }

  private initFirebase() {
    const serviceAccountJson = this.configService.get<string>('FIREBASE_SERVICE_ACCOUNT');
    if (!serviceAccountJson) return;
    try {
      const admin = require('firebase-admin');
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      this.firebaseAdmin = admin;
      this.firebaseInitialized = true;
      this.logger.log('Firebase Admin initialized for push notifications');
    } catch (err) {
      this.logger.error('Failed to initialize Firebase Admin: ' + err.message);
    }
  }

  private getApnsJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    // APNs tokens are valid for 1 hour, refresh every 50 min
    if (this.apnsToken && now - this.apnsTokenIssuedAt < 3000) {
      return this.apnsToken;
    }
    this.apnsToken = jwt.sign({ iss: this.apnsTeamId, iat: now }, this.apnsKey, {
      algorithm: 'ES256',
      header: { alg: 'ES256', kid: this.apnsKeyId },
    });
    this.apnsTokenIssuedAt = now;
    return this.apnsToken;
  }

  private async sendApns(
    deviceToken: string,
    payload: { title: string; body: string; data?: Record<string, string> },
  ): Promise<boolean> {
    const host = this.apnsProduction
      ? 'api.push.apple.com'
      : 'api.sandbox.push.apple.com';

    const apnsPayload = JSON.stringify({
      aps: {
        alert: { title: payload.title, body: payload.body },
        sound: 'default',
        badge: 1,
      },
      ...payload.data,
    });

    return new Promise((resolve) => {
      const client = http2.connect(`https://${host}`);
      client.on('error', (err) => {
        this.logger.error(`APNs connection error: ${err.message}`);
        client.close();
        resolve(false);
      });

      const headers = {
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        'authorization': `bearer ${this.getApnsJwt()}`,
        'apns-topic': this.apnsBundleId,
        'apns-push-type': 'alert',
        'apns-priority': '10',
        'apns-expiration': '0',
        'content-type': 'application/json',
      };

      const req = client.request(headers);
      let responseData = '';
      let statusCode = 0;

      req.on('response', (headers) => {
        statusCode = headers[':status'] as number;
      });

      req.on('data', (chunk) => {
        responseData += chunk;
      });

      req.on('end', () => {
        client.close();
        if (statusCode === 200) {
          resolve(true);
        } else {
          this.logger.warn(`APNs error ${statusCode}: ${responseData}`);
          // Token is invalid/expired
          if (statusCode === 410 || (statusCode === 400 && responseData.includes('BadDeviceToken'))) {
            this.deviceTokenRepository.update({ token: deviceToken }, { isActive: false });
          }
          resolve(false);
        }
      });

      req.on('error', (err) => {
        this.logger.error(`APNs request error: ${err.message}`);
        client.close();
        resolve(false);
      });

      req.write(apnsPayload);
      req.end();
    });
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
    if (!this.apnsEnabled && !this.firebaseInitialized) return;

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

    const data = {
      type: notification.type,
      link: notification.link || '',
      notificationId: notification.notificationId || '',
    };

    const iosTokens = tokens.filter((t) => t.platform === DevicePlatform.IOS);
    const androidTokens = tokens.filter((t) => t.platform === DevicePlatform.ANDROID);

    // Send to iOS via APNs (direct) or Firebase
    if (iosTokens.length > 0) {
      if (this.apnsEnabled) {
        const results = await Promise.all(
          iosTokens.map((t) =>
            this.sendApns(t.token, {
              title: notification.title,
              body: notification.message,
              data,
            }),
          ),
        );
        const successCount = results.filter(Boolean).length;
        if (successCount > 0) {
          this.logger.debug(`APNs: sent to ${successCount}/${iosTokens.length} iOS devices for user ${userId}`);
        }
      } else if (this.firebaseInitialized) {
        await this.sendViaFirebase(iosTokens.map((t) => t.token), notification, data);
      }
    }

    // Send to Android via Firebase
    if (androidTokens.length > 0 && this.firebaseInitialized) {
      await this.sendViaFirebase(androidTokens.map((t) => t.token), notification, data);
    }
  }

  private async sendViaFirebase(
    fcmTokens: string[],
    notification: { title: string; message: string },
    data: Record<string, string>,
  ): Promise<void> {
    if (!this.firebaseAdmin) return;
    try {
      const response = await this.firebaseAdmin.messaging().sendEachForMulticast({
        tokens: fcmTokens,
        notification: {
          title: notification.title,
          body: notification.message,
        },
        data,
        apns: {
          payload: { aps: { sound: 'default', badge: 1 } },
        },
        android: {
          priority: 'high' as const,
          notification: { sound: 'default', channelId: 'crm_notifications' },
        },
      });

      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error?.code === 'messaging/registration-token-not-registered') {
          this.deviceTokenRepository.update({ token: fcmTokens[idx] }, { isActive: false });
        }
      });

      const successCount = response.responses.filter((r) => r.success).length;
      if (successCount > 0) {
        this.logger.debug(`FCM: sent to ${successCount}/${fcmTokens.length} devices`);
      }
    } catch (err) {
      this.logger.error(`FCM push failed: ${err.message}`);
    }
  }
}
