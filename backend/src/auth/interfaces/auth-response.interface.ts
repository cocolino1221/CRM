import { UserRole, UserStatus } from '../../database/entities/user.entity';

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
    status: UserStatus;
    workspaceId: string;
  };
  accessToken: string;
  refreshToken: string;
  pendingApproval?: boolean;
}