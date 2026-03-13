export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  status?: string;
  workspaceId: string;
  avatar?: string;
  preferences?: any;
}

export interface AuthResponse {
  accessToken?: string;
  pendingApproval?: boolean;
  user: User;
}

export interface WhatsAppActivity {
  id: string;
  title: string;
  description: string;
  direction: 'inbound' | 'outbound';
  occurredAt: string;
  metadata: {
    whatsappMessageId?: string;
    waId?: string;
    messageType?: string;
    messageStatus?: 'sent' | 'delivered' | 'read' | 'failed';
    mediaUrl?: string;
    mediaCaption?: string;
    fileName?: string;
  };
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    status: string;
  } | null;
}

export interface Conversation {
  waId: string;
  contactName: string;
  contactId: string | null;
  phone: string;
  lastMessage: string;
  lastMessageTime: string;
  messageCount: number;
  messages: WhatsAppActivity[];
  unreadCount: number;
  lastInboundTime: string | null;
}

export interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  status: string;
  source?: string;
  type?: string;
  leadScore?: number;
  tags?: string[];
  notes?: string;
  pipelineStage?: string;
  pipelineId?: string;
  company?: { id: string; name: string };
  owner?: { id: string; firstName: string; lastName: string };
  deals?: Array<{ id: string; title: string; stage?: string; value?: number }>;
  customFields?: any;
  createdAt: string;
  updatedAt?: string;
}

export interface Pipeline {
  id: string;
  name: string;
  stages: string[];
  isDefault?: boolean;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  link?: string;
  metadata?: any;
  createdAt: string;
}

export interface DocumentPaymentMetadata {
  status?: string;
  amount?: number;
  currency?: string;
  paymentLink?: string;
  failureReason?: string;
}

export interface Document {
  id: string;
  name: string;
  type: string;
  status: string;
  provider: string;
  createdAt: string;
  sentAt?: string;
  signedAt?: string;
  signingUrl?: string;
  recipients?: Array<{
    email?: string;
    name?: string;
    status?: string;
  }>;
  metadata?: {
    provider?: string;
    payment?: DocumentPaymentMetadata;
  };
}
