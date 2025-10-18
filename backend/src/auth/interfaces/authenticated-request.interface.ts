import { Request } from 'express';
import { User } from '../../database/entities/user.entity';

export interface AuthenticatedUser extends User {
  workspaceId: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
  workspace?: {
    id: string;
    name: string;
  };
}