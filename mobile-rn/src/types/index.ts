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
    senderIntegrationId?: string;
    senderPhoneNumberId?: string;
    senderPhoneDisplay?: string;
    mediaId?: string;
    mediaUrl?: string;
    mediaType?: 'image' | 'video' | 'audio' | 'document' | 'template';
    mediaMimeType?: string;
    mediaCaption?: string;
    fileName?: string;
    reactionEmoji?: string;
    reactionMessageId?: string;
    replyToMessageId?: string;
    replyPreviewText?: string;
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
  preferredSenderIntegrationId?: string | null;
  preferredSenderPhoneDisplay?: string | null;
  phone: string;
  lastMessage: string;
  lastMessageTime: string;
  messageCount: number;
  messages: WhatsAppActivity[];
  unreadCount: number;
  lastInboundTime: string | null;
  assignment?: ConversationAssignment | null;
  archived?: boolean;
  pinned?: boolean;
  mutedUntil?: string | null;
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

export type MetaChannel = 'messenger' | 'instagram';
export type MetaInboxFilter = 'all' | 'messenger' | 'instagram';

export interface MetaMessage {
  id: string;
  direction: 'inbound' | 'outbound' | 'internal';
  description: string;
  occurredAt: string;
  metadata: {
    externalMessageId?: string;
    externalThreadId?: string;
    externalUserId?: string;
    messageType?: string;
    attachmentUrl?: string;
    attachmentMimeType?: string;
    attachmentName?: string;
    senderPageName?: string;
    senderAccountName?: string;
    isSimulated?: boolean;
    messageStatus?: string;
  };
}

export interface MetaConversation {
  id: string;
  channel: MetaChannel;
  externalUserId: string;
  externalThreadId: string;
  integrationId?: string | null;
  accountId?: string | null;
  accountName?: string | null;
  messageProfileId?: string | null;
  messageProfileName?: string | null;
  contactId?: string | null;
  contactName: string;
  contactSource?: string | null;
  setterId?: string | null;
  setterName?: string | null;
  closerId?: string | null;
  closerName?: string | null;
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages: MetaMessage[];
}

export interface MetaAccount {
  integrationId: string;
  provider: 'facebook' | 'instagram';
  name: string;
  status: string;
  liveReady: boolean;
  warning?: string | null;
  messageProfileId?: string | null;
  messageProfileName?: string | null;
  account?: {
    pageId?: string | null;
    pageName?: string | null;
    igUserId?: string | null;
    igUsername?: string | null;
  } | null;
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
