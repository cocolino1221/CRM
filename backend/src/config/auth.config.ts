import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET,
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  oauthStateSecret: process.env.OAUTH_STATE_SECRET, // Dedicated secret for OAuth state tokens
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS, 10) || 12,
  maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS, 10) || 5,
  lockoutDuration: parseInt(process.env.LOCKOUT_DURATION, 10) || 15 * 60 * 1000, // 15 minutes
}));
