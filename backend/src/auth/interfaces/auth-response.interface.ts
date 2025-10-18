import { UserRole } from '../../database/entities/user.entity';

/**
 * Authentication response interface
 */
export interface AuthResponse {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    workspaceId: string;
  };
  accessToken: string;
  refreshToken: string;
}