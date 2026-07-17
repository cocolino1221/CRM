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
    preferences?: Record<string, any>;
  };
  accessToken: string;
  refreshToken: string;
  pendingApproval?: boolean;
}

/**
 * Returned instead of tokens when one email exists in multiple workspaces —
 * the client must let the user pick a workspace, then call
 * POST /auth/select-workspace with the selectionToken + chosen workspaceId.
 */
export interface WorkspaceSelectionResponse {
  requiresWorkspaceSelection: true;
  selectionToken: string;
  accounts: Array<{
    workspaceId: string;
    workspaceName: string;
    role: UserRole;
  }>;
}
