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
    mediaId?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'document' | 'template';
    mediaMimeType?: string;
    mediaCaption?: string;
    fileName?: string;
    reactionEmoji?: string;
    reactionMessageId?: string;
  };
  contact: {
    id: string;
    firstName: string;
    lastName: string;
    phone: string;
    status: string;
    source?: string;
  } | null;
}

export interface ConversationAssignment {
  userId: string;
  userName: string;
  color?: string;
  assignedAt?: string;
}

export interface Conversation {
  waId: string;
  contactName: string;
  contactId: string | null;
  contactSource?: string | null;
  phone: string;
  lastMessage: string;
  lastMessageTime: string;
  messageCount: number;
  messages: WhatsAppActivity[];
  unreadCount: number;
  lastInboundTime: string | null;
  assignment?: ConversationAssignment | null;
  archived?: boolean;
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

export interface PipelineStage {
  id: string;
  name: string;
  displayOrder?: number;
  color?: string;
}

export interface Pipeline {
  id: string;
  name: string;
  stages: PipelineStage[];
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
