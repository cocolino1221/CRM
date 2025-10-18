/**
 * Common types shared across all services
 */

export interface PaginationQuery {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginationResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata?: {
    timestamp: string;
    requestId: string;
    version: string;
  };
}

export interface AuditFields {
  createdAt: Date;
  updatedAt: Date;
  deletedAt?: Date;
}

export interface WorkspaceScoped {
  workspaceId: string;
}

export interface UserScoped {
  userId: string;
}

export enum UserRole {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  MANAGER = 'manager',
  SALES_REP = 'sales_rep',
  SUPPORT_AGENT = 'support_agent',
  VIEWER = 'viewer',
}

export enum ContactStatus {
  LEAD = 'lead',
  PROSPECT = 'prospect',
  QUALIFIED = 'qualified',
  CUSTOMER = 'customer',
  INACTIVE = 'inactive',
  CHURNED = 'churned',
}

export enum DealStage {
  LEAD = 'lead',
  QUALIFIED = 'qualified',
  PROPOSAL = 'proposal',
  NEGOTIATION = 'negotiation',
  CLOSED_WON = 'closed_won',
  CLOSED_LOST = 'closed_lost',
}

export enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  OVERDUE = 'overdue',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

export enum ActivityType {
  EMAIL = 'email',
  CALL = 'call',
  MEETING = 'meeting',
  NOTE = 'note',
  SMS = 'sms',
  TASK = 'task',
  SLACK_MESSAGE = 'slack_message',
  FORM_SUBMISSION = 'form_submission',
  SYSTEM = 'system',
  WEBHOOK = 'webhook',
}

export type CustomFields = Record<string, any>;