import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { User } from './user.entity';
import { Contact } from './contact.entity';
import { Deal } from './deal.entity';
import { Integration } from './integration.entity';

export enum DocumentType {
  CONTRACT = 'contract',
  PROPOSAL = 'proposal',
  QUOTE = 'quote',
  INVOICE = 'invoice',
  NDA = 'nda',
  SOW = 'sow', // Statement of Work
  MSA = 'msa', // Master Services Agreement
  OTHER = 'other',
}

export enum DocumentStatus {
  DRAFT = 'draft',
  PENDING = 'pending',
  SENT = 'sent',
  VIEWED = 'viewed',
  COMPLETED = 'completed',
  SIGNED = 'signed',
  DECLINED = 'declined',
  EXPIRED = 'expired',
  VOIDED = 'voided',
}

export enum DocumentProvider {
  PANDADOC = 'pandadoc',
  DOCUSIGN = 'docusign',
  INTERNAL = 'internal',
}

@Entity('documents')
@Index('IDX_documents_workspace_status', ['workspaceId', 'status'])
@Index('IDX_documents_workspace_type', ['workspaceId', 'type'])
@Index('IDX_documents_created_by', ['createdById'])
@Index('IDX_documents_contact', ['contactId'])
@Index('IDX_documents_deal', ['dealId'])
@Index('IDX_documents_external_id', ['externalId'])
@Index('IDX_documents_created_at', ['createdAt'])
export class Document extends WorkspaceEntity {
  @Column({
    type: 'varchar',
    length: 255,
    comment: 'Document name/title',
  })
  name: string;

  @Column({
    type: 'enum',
    enum: DocumentType,
    default: DocumentType.OTHER,
    comment: 'Document type',
  })
  @Index('IDX_documents_type')
  type: DocumentType;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    default: DocumentStatus.DRAFT,
    comment: 'Document status',
  })
  @Index('IDX_documents_status')
  status: DocumentStatus;

  @Column({
    type: 'enum',
    enum: DocumentProvider,
    comment: 'Document provider/platform',
  })
  provider: DocumentProvider;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    comment: 'External document ID from provider',
  })
  externalId?: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Document description',
  })
  description?: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'Document URL from provider',
  })
  documentUrl?: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'Signing URL for recipients',
  })
  signingUrl?: string;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
    comment: 'Download URL for completed document',
  })
  downloadUrl?: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Document template information',
  })
  template?: {
    id?: string;
    name?: string;
    version?: string;
    fields?: Record<string, any>;
  };

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Document recipients/signers',
  })
  recipients?: Array<{
    email: string;
    name?: string;
    phone?: string;
    role?: string;
    order?: number;
    status?: 'pending' | 'sent' | 'viewed' | 'signed' | 'declined';
    signedAt?: Date;
    viewedAt?: Date;
    sentAt?: Date;
    ipAddress?: string;
  }>;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Document field values',
  })
  fields?: Record<string, any>;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Document metadata from provider',
  })
  metadata?: {
    version?: string;
    pageCount?: number;
    fileSize?: number;
    fileType?: string;
    tags?: string[];
    customFields?: Record<string, any>;

    // Tracking
    viewCount?: number;
    lastViewedAt?: Date;
    downloadCount?: number;
    lastDownloadedAt?: Date;

    // Provider-specific
    [key: string]: any;
  };

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'When document was sent',
  })
  sentAt?: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'When document was first viewed',
  })
  viewedAt?: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'When document was signed/completed',
  })
  signedAt?: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'When document expires',
  })
  expiresAt?: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
    comment: 'When document was voided',
  })
  voidedAt?: Date;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Void reason',
  })
  voidReason?: string;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Audit trail/history',
  })
  auditTrail?: Array<{
    timestamp: Date;
    action: string;
    actor?: string;
    details?: Record<string, any>;
  }>;

  // Relationships
  @Column('uuid', { nullable: true })
  createdById?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'createdById' })
  createdBy?: User;

  @Column('uuid', { nullable: true })
  contactId?: string;

  @ManyToOne(() => Contact, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'contactId' })
  contact?: Contact;

  @Column('uuid', { nullable: true })
  dealId?: string;

  @ManyToOne(() => Deal, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'dealId' })
  deal?: Deal;

  @Column('uuid', { nullable: true })
  integrationId?: string;

  @ManyToOne(() => Integration, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'integrationId' })
  integration?: Integration;

  // Virtual properties
  get isExpired(): boolean {
    if (!this.expiresAt) return false;
    return this.expiresAt < new Date();
  }

  get isPending(): boolean {
    return this.status === DocumentStatus.PENDING || this.status === DocumentStatus.SENT;
  }

  get isCompleted(): boolean {
    return this.status === DocumentStatus.COMPLETED || this.status === DocumentStatus.SIGNED;
  }

  get isCancelled(): boolean {
    return this.status === DocumentStatus.DECLINED ||
           this.status === DocumentStatus.VOIDED ||
           this.status === DocumentStatus.EXPIRED;
  }

  get daysUntilExpiry(): number | null {
    if (!this.expiresAt) return null;
    const diff = this.expiresAt.getTime() - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  get allRecipientsSigned(): boolean {
    if (!this.recipients || this.recipients.length === 0) return false;
    return this.recipients.every(r => r.status === 'signed');
  }

  /**
   * Get completion percentage
   */
  getCompletionPercentage(): number {
    if (!this.recipients || this.recipients.length === 0) return 0;
    const signed = this.recipients.filter(r => r.status === 'signed').length;
    return Math.round((signed / this.recipients.length) * 100);
  }

  /**
   * Add audit trail entry
   */
  addAuditEntry(action: string, actor?: string, details?: Record<string, any>): void {
    if (!this.auditTrail) {
      this.auditTrail = [];
    }
    this.auditTrail.push({
      timestamp: new Date(),
      action,
      actor,
      details,
    });
  }

  /**
   * Mark document as sent
   */
  markAsSent(): void {
    this.status = DocumentStatus.SENT;
    this.sentAt = new Date();
    this.addAuditEntry('sent');
  }

  /**
   * Mark document as viewed
   */
  markAsViewed(): void {
    if (this.status === DocumentStatus.SENT) {
      this.status = DocumentStatus.VIEWED;
    }
    if (!this.viewedAt) {
      this.viewedAt = new Date();
    }
    this.addAuditEntry('viewed');
  }

  /**
   * Mark document as completed/signed
   */
  markAsCompleted(): void {
    this.status = DocumentStatus.SIGNED;
    this.signedAt = new Date();
    this.addAuditEntry('signed');
  }

  /**
   * Void document
   */
  void(reason?: string): void {
    this.status = DocumentStatus.VOIDED;
    this.voidedAt = new Date();
    this.voidReason = reason;
    this.addAuditEntry('voided', undefined, { reason });
  }
}
