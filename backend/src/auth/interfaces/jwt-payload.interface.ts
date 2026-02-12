import { UserRole } from '../../database/entities/user.entity';

/**
 * JWT Payload interface
 */
export interface JwtPayload {
  sub: string; // User ID
  email: string;
  role: UserRole;
  workspaceId: string;
  jti: string; // JWT ID - unique identifier for token revocation
  iat?: number; // Issued at
  exp?: number; // Expires at
}