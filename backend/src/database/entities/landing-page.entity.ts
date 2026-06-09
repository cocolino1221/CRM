import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { User } from './user.entity';

export enum LandingPageStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

export enum LandingPageCaptureType {
  NATIVE = 'native',
  TYPEFORM = 'typeform',
}

export interface LandingPageHero {
  logo?: string;
  title?: string;
  subtitle?: string;
  image?: string;
  video?: string;
  accentColor?: string;
}

export interface LandingPageTheme {
  accentColor?: string;
  backgroundColor?: string;
  cardColor?: string;
  textColor?: string;
  fontFamily?: string;
}

export interface LandingPageContent {
  hero?: LandingPageHero;
  benefits?: string[];
  theme?: LandingPageTheme;
  themePreset?: string;
}

export interface LandingPageTypeformConfig {
  formId?: string;
  embedType?: 'inline';
}

export interface LandingPagePostSubmit {
  successMessage?: string;
  redirectUrl?: string;
  whatsapp?: {
    enabled?: boolean;
    message?: string;
  };
}

export interface LandingPageSeo {
  title?: string;
  description?: string;
  ogImage?: string;
}

@Entity('landing_pages')
@Index('IDX_landing_pages_workspace_status', ['workspaceId', 'status'])
export class LandingPage extends WorkspaceEntity {
  @Column({ type: 'varchar', length: 255, comment: 'Internal name' })
  name: string;

  @Column({ type: 'varchar', length: 100, unique: true, comment: 'Public URL slug /p/{slug}' })
  @Index('IDX_landing_pages_slug')
  slug: string;

  @Column({
    type: 'enum',
    enum: LandingPageStatus,
    default: LandingPageStatus.DRAFT,
  })
  status: LandingPageStatus;

  @Column({ type: 'jsonb', nullable: true, comment: 'Hero, benefits, theme' })
  content?: LandingPageContent;

  @Column({
    type: 'enum',
    enum: LandingPageCaptureType,
    default: LandingPageCaptureType.NATIVE,
  })
  captureType: LandingPageCaptureType;

  @Column({ type: 'uuid', nullable: true, comment: 'FK to Form (native capture)' })
  formId?: string;

  @Column({ type: 'jsonb', nullable: true, comment: 'Typeform embed config' })
  typeformConfig?: LandingPageTypeformConfig;

  @Column({ type: 'jsonb', nullable: true, comment: 'Post-submit behavior (native only)' })
  postSubmit?: LandingPagePostSubmit;

  @Column({ type: 'int', default: 0, comment: 'Total raw views' })
  viewCount: number;

  @Column({ type: 'int', default: 0, comment: 'Deduped unique views' })
  uniqueViewCount: number;

  @Column({ type: 'int', default: 0 })
  submissionCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastSubmittedAt?: Date;

  @Column({ type: 'timestamptz', nullable: true, comment: 'First active transition' })
  publishedAt?: Date;

  @Column({ type: 'jsonb', nullable: true, comment: 'SEO metadata' })
  seo?: LandingPageSeo;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: 'A/B experiment hook' })
  experimentId?: string;

  @Column({ type: 'varchar', length: 50, nullable: true, comment: 'A/B variant group' })
  variantGroup?: string;

  @Column('uuid')
  createdById: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'createdById' })
  createdBy: User;

  get conversionRate(): number {
    const base = this.uniqueViewCount > 0 ? this.uniqueViewCount : this.viewCount;
    if (!base) return 0;
    return (this.submissionCount / base) * 100;
  }
}
