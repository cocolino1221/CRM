export type FunnelStatus = 'draft' | 'active' | 'archived';
export type FunnelEnrollmentStatus = 'active' | 'completed' | 'exited';

export interface Funnel {
  id: string;
  workspaceId: string;
  name: string;
  status: FunnelStatus;
  integrationId: string;
  flowId: string;
  anchorDate?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FunnelEnrollment {
  id: string;
  funnelId: string;
  contactId: string;
  waId: string;
  status: FunnelEnrollmentStatus;
  currentStepId?: string;
  attendedManual?: boolean;
  enrolledAt: string;
}
