import { registerAs } from '@nestjs/config';

/**
 * Encryption configuration for sensitive data storage
 * Uses AES-256-GCM for authenticated encryption
 */
export default registerAs('encryption', () => {
  const encryptionKey = process.env.ENCRYPTION_KEY;

  if (!encryptionKey) {
    throw new Error(
      'ENCRYPTION_KEY is required for encrypting sensitive data. ' +
      'Generate a 32-byte (64-character) hex string for production. ' +
      'Example: openssl rand -hex 32'
    );
  }

  // Validate key length (should be 32 bytes = 64 hex characters)
  if (encryptionKey.length < 64) {
    throw new Error(
      'ENCRYPTION_KEY must be at least 64 characters (32 bytes in hex format). ' +
      'Current length: ' + encryptionKey.length
    );
  }

  return {
    key: encryptionKey,
    algorithm: 'aes-256-gcm',
    ivLength: 16, // 128 bits for GCM
    authTagLength: 16, // 128 bits authentication tag
  };
});
