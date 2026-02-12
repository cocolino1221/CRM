import { ValueTransformer } from 'typeorm';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { Logger } from '@nestjs/common';

/**
 * TypeORM transformer for encrypting/decrypting sensitive data
 * Uses AES-256-GCM authenticated encryption
 *
 * Encrypted format: iv:authTag:encryptedData (all hex-encoded)
 *
 * @example
 * ```typescript
 * @Column({
 *   type: 'text',
 *   transformer: encryptionTransformer,
 * })
 * credentials: any;
 * ```
 */
export class EncryptionTransformer implements ValueTransformer {
  private readonly logger = new Logger(EncryptionTransformer.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 16; // 128 bits
  private readonly authTagLength = 16; // 128 bits
  private encryptionKey: Buffer | null = null;

  constructor() {
    this.initializeKey();
  }

  private initializeKey(): void {
    try {
      const keyHex = process.env.ENCRYPTION_KEY;

      if (!keyHex) {
        // Only block startup in production - in dev/undefined environments, store unencrypted
        if (process.env.NODE_ENV === 'production') {
          throw new Error('ENCRYPTION_KEY is required for production deployment');
        }

        this.logger.warn(
          'ENCRYPTION_KEY not set - credentials will be stored UNENCRYPTED. ' +
          'This is acceptable in development but NEVER in production!'
        );
        return;
      }

      // Convert hex string to Buffer (expect 64 hex chars = 32 bytes)
      this.encryptionKey = Buffer.from(keyHex.slice(0, 64), 'hex');

      if (this.encryptionKey.length !== 32) {
        throw new Error(
          `ENCRYPTION_KEY must be 64 hex characters (32 bytes). Got ${keyHex.length} characters`
        );
      }
    } catch (error) {
      this.logger.error('Failed to initialize encryption key:', error);
      throw error;
    }
  }

  /**
   * Encrypt data before storing in database
   */
  to(value: any): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    // If no encryption key (development mode), store as JSON
    if (!this.encryptionKey) {
      return JSON.stringify(value);
    }

    try {
      // Convert value to JSON string
      const plaintext = JSON.stringify(value);

      // Generate random initialization vector
      const iv = randomBytes(this.ivLength);

      // Create cipher
      const cipher = createCipheriv(this.algorithm, this.encryptionKey, iv, {
        authTagLength: this.authTagLength,
      });

      // Encrypt the data
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get authentication tag
      const authTag = cipher.getAuthTag();

      // Return format: iv:authTag:encryptedData (all hex-encoded)
      const result = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;

      return result;
    } catch (error) {
      this.logger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt sensitive data');
    }
  }

  /**
   * Decrypt data after retrieving from database
   */
  from(value: string | null): any {
    if (!value) {
      return null;
    }

    // If no encryption key (development mode), parse as JSON
    if (!this.encryptionKey) {
      try {
        return JSON.parse(value);
      } catch {
        // If parsing fails, data might be already encrypted from before
        this.logger.warn('Failed to parse unencrypted data - might be encrypted');
        return null;
      }
    }

    try {
      // Check if data is in encrypted format (has colons)
      if (!value.includes(':')) {
        // Legacy unencrypted data - return as-is (parse as JSON)
        this.logger.warn('Found unencrypted credentials - consider re-encrypting');
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }

      // Split into components
      const parts = value.split(':');

      if (parts.length !== 3) {
        this.logger.error(`Invalid encrypted data format. Expected 3 parts, got ${parts.length}`);
        return null;
      }

      const [ivHex, authTagHex, encryptedData] = parts;

      // Convert hex strings back to Buffers
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      // Create decipher
      const decipher = createDecipheriv(this.algorithm, this.encryptionKey, iv, {
        authTagLength: this.authTagLength,
      });

      // Set authentication tag
      decipher.setAuthTag(authTag);

      // Decrypt the data
      let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Parse JSON
      return JSON.parse(decrypted);
    } catch (error) {
      this.logger.error('Decryption failed:', error);

      // In case of decryption failure, return null rather than exposing data
      // This prevents application crashes but indicates data corruption/tampering
      return null;
    }
  }
}

/**
 * Singleton instance of the encryption transformer
 * Use this in your entities
 */
export const encryptionTransformer = new EncryptionTransformer();
