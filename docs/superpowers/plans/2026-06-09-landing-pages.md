# Landing Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add public hosted marketing landing pages at `/p/{slug}` that capture leads via the existing native forms system or an embedded Typeform, feeding leads into the CRM with `source = LANDING_PAGE`.

**Architecture:** New NestJS module `backend/src/landing-pages/` mirroring the `forms` module (entity, DTOs, service, controller, module). The native capture path reuses `FormsService` for validation + submission + contact creation (shared method extracted), and `WhatsAppService` for an optional welcome message. The Typeform path renders an inline iframe only — its leads ride the existing Typeform webhook. Frontend adds a dashboard CRUD area `app/(dashboard)/landing-pages/` and a public server-rendered page `app/p/[slug]/page.tsx` with SEO `generateMetadata`.

**Tech Stack:** NestJS 10, TypeORM (PostgreSQL/Neon), Next.js 15 (App Router), Tailwind CSS 4, Jest.

**Spec:** `docs/superpowers/specs/2026-06-09-landing-pages-design.md`

---

## File Structure

**Backend (new unless noted):**
- `backend/src/database/entities/contact.entity.ts` — MODIFY: add `LANDING_PAGE` to `ContactSource` enum
- `backend/src/database/entities/landing-page.entity.ts` — `LandingPage` entity + enums/interfaces
- `backend/src/database/migrations/1772190000000-AddLandingPages.ts` — create table + indexes + enum value
- `backend/src/landing-pages/theme-presets.ts` — fixed catalog of theme presets
- `backend/src/landing-pages/dto/create-landing-page.dto.ts`
- `backend/src/landing-pages/dto/update-landing-page.dto.ts`
- `backend/src/landing-pages/dto/submit-landing-page.dto.ts`
- `backend/src/landing-pages/landing-pages.service.ts` — CRUD, duplicate, public fetch (view tracking), native submit
- `backend/src/landing-pages/landing-pages.service.spec.ts` — unit tests
- `backend/src/landing-pages/landing-pages.controller.ts` — JWT CRUD + `@Public` slug routes
- `backend/src/landing-pages/landing-pages.module.ts`
- `backend/src/forms/forms.service.ts` — MODIFY: extract `createSubmissionForForm` + `findFormById`, make `processSubmissionContact` take a source
- `backend/src/app.module.ts` — MODIFY: register `LandingPagesModule`

**Frontend (new unless noted):**
- `frontend/lib/landing-pages.ts` — types + api client methods
- `frontend/app/(dashboard)/landing-pages/page.tsx` — list
- `frontend/app/(dashboard)/landing-pages/new/page.tsx` — create
- `frontend/app/(dashboard)/landing-pages/[id]/edit/page.tsx` — editor with live preview
- `frontend/app/p/[slug]/page.tsx` — public server component + `generateMetadata`
- `frontend/app/p/[slug]/LandingPageRender.tsx` — client render (hero + benefits + capture)
- `frontend/components/Sidebar` nav — MODIFY: add "Landing Pages" link (locate exact file in Task 11)

---

## Task 1: Add LANDING_PAGE to ContactSource enum

**Files:**
- Modify: `backend/src/database/entities/contact.entity.ts:31-49`

- [ ] **Step 1: Add the enum value**

In [contact.entity.ts](backend/src/database/entities/contact.entity.ts), add `LANDING_PAGE` to the `ContactSource` enum, right after `MANYCHAT`:

```typescript
export enum ContactSource {
  MANUAL = 'manual',
  WEBSITE = 'website',
  REFERRAL = 'referral',
  SOCIAL_MEDIA = 'social_media',
  EMAIL_CAMPAIGN = 'email_campaign',
  COLD_OUTREACH = 'cold_outreach',
  EVENT = 'event',
  SLACK = 'slack',
  TYPEFORM = 'typeform',
  WHATSAPP = 'whatsapp',
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  LINKEDIN = 'linkedin',
  GOOGLE_ADS = 'google-ads',
  KAJABI = 'kajabi',
  MANYCHAT = 'manychat',
  LANDING_PAGE = 'landing_page',
  OTHER = 'other',
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add backend/src/database/entities/contact.entity.ts
git commit -m "feat(landing-pages): add LANDING_PAGE contact source"
```

---

## Task 2: Create the LandingPage entity

**Files:**
- Create: `backend/src/database/entities/landing-page.entity.ts`

- [ ] **Step 1: Write the entity**

Create [landing-page.entity.ts](backend/src/database/entities/landing-page.entity.ts):

```typescript
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
```

- [ ] **Step 2: Verify entity auto-loading**

Entities are auto-loaded by glob in [data-source.ts:36](backend/src/database/data-source.ts#L36) (`entities: [join(__dirname, 'entities/**/*.entity{.ts,.js}')]`). No manual registration needed.

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/entities/landing-page.entity.ts
git commit -m "feat(landing-pages): add LandingPage entity"
```

---

## Task 3: Write the migration

**Files:**
- Create: `backend/src/database/migrations/1772190000000-AddLandingPages.ts`

- [ ] **Step 1: Write the migration**

Create [1772190000000-AddLandingPages.ts](backend/src/database/migrations/1772190000000-AddLandingPages.ts). Adds the `LANDING_PAGE` value to the existing `contacts_source_enum`, creates the `landing_pages_status_enum` and `landing_pages_capturetype_enum`, then the table + indexes:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLandingPages1772190000000 implements MigrationInterface {
  name = 'AddLandingPages1772190000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add LANDING_PAGE to the existing contacts source enum
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "public"."contacts_source_enum" ADD VALUE IF NOT EXISTS 'landing_page';
      EXCEPTION
        WHEN undefined_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."landing_pages_status_enum" AS ENUM('draft', 'active', 'archived');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."landing_pages_capturetype_enum" AS ENUM('native', 'typeform');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "landing_pages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "workspaceId" uuid NOT NULL,
        "name" character varying(255) NOT NULL,
        "slug" character varying(100) NOT NULL,
        "status" "public"."landing_pages_status_enum" NOT NULL DEFAULT 'draft',
        "content" jsonb,
        "captureType" "public"."landing_pages_capturetype_enum" NOT NULL DEFAULT 'native',
        "formId" uuid,
        "typeformConfig" jsonb,
        "postSubmit" jsonb,
        "viewCount" integer NOT NULL DEFAULT 0,
        "uniqueViewCount" integer NOT NULL DEFAULT 0,
        "submissionCount" integer NOT NULL DEFAULT 0,
        "lastSubmittedAt" TIMESTAMP WITH TIME ZONE,
        "publishedAt" TIMESTAMP WITH TIME ZONE,
        "seo" jsonb,
        "experimentId" character varying(100),
        "variantGroup" character varying(50),
        "createdById" uuid NOT NULL,
        CONSTRAINT "UQ_landing_pages_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_landing_pages" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_landing_pages_slug" ON "landing_pages" ("slug")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_landing_pages_workspace_status" ON "landing_pages" ("workspaceId", "status")
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "landing_pages"
          ADD CONSTRAINT "FK_landing_pages_createdBy"
          FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "landing_pages"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."landing_pages_capturetype_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."landing_pages_status_enum"`);
    // contacts_source_enum value is left in place (Postgres can't drop enum values safely).
  }
}
```

> NOTE: confirm the FK target table name is `users` and the uuid default function is `uuid_generate_v4()` by skimming an existing migration that creates a workspace-scoped table (e.g. `grep -rl "uuid_generate_v4\|gen_random_uuid" backend/src/database/migrations | head`). If the repo uses `gen_random_uuid()`, swap the default accordingly.

- [ ] **Step 2: Run the migration locally**

Run: `cd backend && npm run migration:run`
Expected: log shows `Migration AddLandingPages1772190000000 has been executed successfully.`

- [ ] **Step 3: Verify table exists, then revert and re-run to prove down() works**

Run: `cd backend && npm run migration:revert && npm run migration:run`
Expected: revert drops the table, re-run recreates it, both succeed.

- [ ] **Step 4: Commit**

```bash
git add backend/src/database/migrations/1772190000000-AddLandingPages.ts
git commit -m "feat(landing-pages): add landing_pages table migration"
```

---

## Task 4: Theme presets catalog

**Files:**
- Create: `backend/src/landing-pages/theme-presets.ts`

- [ ] **Step 1: Write the preset catalog**

Create [theme-presets.ts](backend/src/landing-pages/theme-presets.ts):

```typescript
import { LandingPageTheme } from '../database/entities/landing-page.entity';

export interface ThemePreset {
  key: string;
  label: string;
  theme: LandingPageTheme;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    key: 'clean-light',
    label: 'Clean Light',
    theme: {
      accentColor: '#2563eb',
      backgroundColor: '#ffffff',
      cardColor: '#f8fafc',
      textColor: '#0f172a',
      fontFamily: 'Inter, system-ui, sans-serif',
    },
  },
  {
    key: 'bold-dark',
    label: 'Bold Dark',
    theme: {
      accentColor: '#22d3ee',
      backgroundColor: '#0f172a',
      cardColor: '#1e293b',
      textColor: '#f1f5f9',
      fontFamily: 'Inter, system-ui, sans-serif',
    },
  },
  {
    key: 'brand-accent',
    label: 'Brand Accent',
    theme: {
      accentColor: '#7c3aed',
      backgroundColor: '#faf5ff',
      cardColor: '#ffffff',
      textColor: '#1e1b4b',
      fontFamily: 'Inter, system-ui, sans-serif',
    },
  },
];

export function getThemePreset(key?: string): ThemePreset | undefined {
  if (!key) return undefined;
  return THEME_PRESETS.find((p) => p.key === key);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/landing-pages/theme-presets.ts
git commit -m "feat(landing-pages): add theme preset catalog"
```

---

## Task 5: Extract reusable submission logic in FormsService

The landing-pages native path must reuse forms validation + submission + contact creation, but with `source = LANDING_PAGE` and against a form referenced by id (not by active slug). Extract a shared method and a form lookup, then refactor `submitForm` to call it.

**Files:**
- Modify: `backend/src/forms/forms.service.ts`

- [ ] **Step 1: Make `processSubmissionContact` accept a source and return the contact**

In [forms.service.ts:332-380](backend/src/forms/forms.service.ts#L332-L380), change the signature and the `source:` line, and return the contact:

```typescript
  private async processSubmissionContact(
    form: Form,
    submission: FormSubmission,
    source: ContactSource = ContactSource.WEBSITE,
  ): Promise<Contact | null> {
    try {
      const emailField = form.fields.find((f) => f.type === 'email');
      if (!emailField || !submission.data[emailField.id]) {
        return null;
      }

      const email = submission.data[emailField.id];

      const firstNameField = form.fields.find((f) =>
        f.label.toLowerCase().includes('first') && f.label.toLowerCase().includes('name')
      );
      const lastNameField = form.fields.find((f) =>
        f.label.toLowerCase().includes('last') && f.label.toLowerCase().includes('name')
      );
      const phoneField = form.fields.find((f) => f.type === 'phone');

      let contact = await this.contactRepository.findOne({
        where: { email, workspaceId: form.workspaceId },
      });

      if (!contact) {
        contact = this.contactRepository.create({
          email,
          firstName: firstNameField ? submission.data[firstNameField.id] : 'Form',
          lastName: lastNameField ? submission.data[lastNameField.id] : 'Lead',
          phone: phoneField ? submission.data[phoneField.id] : undefined,
          source,
          workspaceId: form.workspaceId,
          ownerId: form.createdById,
          notes: `Submitted form: ${form.name}`,
        });

        contact = await this.contactRepository.save(contact);
      }

      submission.contactId = contact.id;
      await this.submissionRepository.save(submission);
      return contact;
    } catch (error) {
      this.logger.error(`Failed to process submission contact: ${error.message}`);
      return null;
    }
  }
```

- [ ] **Step 2: Add `findFormById` and `createSubmissionForForm` public methods**

In [forms.service.ts](backend/src/forms/forms.service.ts), add these two methods (place them right after the `submitForm` method, before `getSubmissions`):

```typescript
  /** Lookup a form by id within a workspace, regardless of status. */
  async findFormById(formId: string, workspaceId: string): Promise<Form | null> {
    return this.formRepository.findOne({ where: { id: formId, workspaceId } });
  }

  /**
   * Validate + persist a submission against a known Form entity, create/link a
   * Contact with the given source, bump form stats. Shared by forms public
   * submit and landing-pages native submit.
   */
  async createSubmissionForForm(
    form: Form,
    data: Record<string, any>,
    metadata: {
      ipAddress?: string;
      userAgent?: string;
      referrer?: string;
      trackingData?: Record<string, any>;
    },
    source: ContactSource = ContactSource.WEBSITE,
  ): Promise<{ submission: FormSubmission; contact: Contact | null }> {
    this.validateSubmission(form, data);

    const submission = this.submissionRepository.create({
      formId: form.id,
      data,
      status: SubmissionStatus.NEW,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      referrer: metadata.referrer,
      trackingData: metadata.trackingData,
    });

    const savedSubmission = await this.submissionRepository.save(submission);

    await this.formRepository.update(form.id, {
      submissionCount: form.submissionCount + 1,
      lastSubmittedAt: new Date(),
    });

    const contact = await this.processSubmissionContact(form, savedSubmission, source);

    return { submission: savedSubmission, contact };
  }
```

- [ ] **Step 3: Refactor `submitForm` to reuse `createSubmissionForForm`**

Replace the body of `submitForm` ([forms.service.ts:113-167](backend/src/forms/forms.service.ts#L113-L167)) from the `// Validate required fields` comment onward with a call to the shared method:

```typescript
  async submitForm(
    slug: string,
    submitFormDto: SubmitFormDto,
    metadata?: { ipAddress?: string; userAgent?: string; referrer?: string },
  ): Promise<FormSubmission> {
    const form = await this.findBySlug(slug);

    if (form.settings?.requireAuthentication) {
      throw new BadRequestException('Authentication required for this form');
    }

    if (!form.settings?.allowMultipleSubmissions && metadata?.ipAddress) {
      const existingSubmission = await this.submissionRepository.findOne({
        where: {
          formId: form.id,
          ipAddress: metadata.ipAddress,
        },
      });

      if (existingSubmission) {
        throw new BadRequestException('You have already submitted this form');
      }
    }

    const { submission } = await this.createSubmissionForForm(
      form,
      submitFormDto.data,
      { ...metadata, trackingData: submitFormDto.trackingData },
      ContactSource.WEBSITE,
    );

    this.logger.log(`Form submission received for form: ${form.name}`);

    return submission;
  }
```

> Ensure `Contact` is imported in forms.service.ts (it already imports `ContactSource` from the same module — extend that import to `import { Contact, ContactSource } from '../database/entities/contact.entity';`).

- [ ] **Step 4: Export FormsService is already done; typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Run existing forms-adjacent tests to confirm no regression**

Run: `cd backend && npx jest forms --passWithNoTests`
Expected: PASS (or "no tests found" — fine; the typecheck is the real gate here).

- [ ] **Step 6: Commit**

```bash
git add backend/src/forms/forms.service.ts
git commit -m "refactor(forms): extract reusable createSubmissionForForm + findFormById"
```

---

## Task 6: Landing-pages DTOs

**Files:**
- Create: `backend/src/landing-pages/dto/create-landing-page.dto.ts`
- Create: `backend/src/landing-pages/dto/update-landing-page.dto.ts`
- Create: `backend/src/landing-pages/dto/submit-landing-page.dto.ts`

- [ ] **Step 1: Write create DTO**

Create [create-landing-page.dto.ts](backend/src/landing-pages/dto/create-landing-page.dto.ts):

```typescript
import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsUUID,
  MaxLength,
} from 'class-validator';
import {
  LandingPageStatus,
  LandingPageCaptureType,
  LandingPageContent,
  LandingPageTypeformConfig,
  LandingPagePostSubmit,
  LandingPageSeo,
} from '../../database/entities/landing-page.entity';

export class CreateLandingPageDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string;

  @IsOptional()
  @IsEnum(LandingPageStatus)
  status?: LandingPageStatus;

  @IsOptional()
  @IsObject()
  content?: LandingPageContent;

  @IsOptional()
  @IsEnum(LandingPageCaptureType)
  captureType?: LandingPageCaptureType;

  @IsOptional()
  @IsUUID()
  formId?: string;

  @IsOptional()
  @IsObject()
  typeformConfig?: LandingPageTypeformConfig;

  @IsOptional()
  @IsObject()
  postSubmit?: LandingPagePostSubmit;

  @IsOptional()
  @IsObject()
  seo?: LandingPageSeo;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  experimentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  variantGroup?: string;
}
```

- [ ] **Step 2: Write update DTO**

Create [update-landing-page.dto.ts](backend/src/landing-pages/dto/update-landing-page.dto.ts):

```typescript
import { PartialType } from '@nestjs/mapped-types';
import { CreateLandingPageDto } from './create-landing-page.dto';

export class UpdateLandingPageDto extends PartialType(CreateLandingPageDto) {}
```

> Confirm `@nestjs/mapped-types` is a dependency: `grep mapped-types backend/package.json`. The forms `update-form.dto.ts` already uses it; if it imports from `@nestjs/swagger` instead, mirror that import.

- [ ] **Step 3: Write submit DTO**

Create [submit-landing-page.dto.ts](backend/src/landing-pages/dto/submit-landing-page.dto.ts):

```typescript
import { IsObject, IsOptional } from 'class-validator';

export class SubmitLandingPageDto {
  @IsObject()
  data: Record<string, any>;

  @IsOptional()
  @IsObject()
  trackingData?: Record<string, any>;
}
```

- [ ] **Step 4: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/landing-pages/dto/
git commit -m "feat(landing-pages): add DTOs"
```

---

## Task 7: LandingPagesService

The service owns CRUD, slug generation/uniqueness, `publishedAt` stamping, public fetch with view tracking, duplication, and native submit (delegating to `FormsService` + `WhatsAppService`).

**Files:**
- Create: `backend/src/landing-pages/landing-pages.service.ts`
- Test: `backend/src/landing-pages/landing-pages.service.spec.ts`

- [ ] **Step 1: Write the failing test**

Create [landing-pages.service.spec.ts](backend/src/landing-pages/landing-pages.service.spec.ts):

```typescript
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LandingPagesService } from './landing-pages.service';
import {
  LandingPage,
  LandingPageStatus,
  LandingPageCaptureType,
} from '../database/entities/landing-page.entity';
import { FormsService } from '../forms/forms.service';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';
import { ContactSource } from '../database/entities/contact.entity';

describe('LandingPagesService', () => {
  let service: LandingPagesService;
  let repo: any;
  let formsService: any;
  let whatsappService: any;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'lp1', ...x })),
      update: jest.fn(async () => undefined),
      remove: jest.fn(async () => undefined),
      createQueryBuilder: jest.fn(() => ({
        leftJoinAndSelect: () => ({}),
        where: () => ({ andWhere: () => ({}), orderBy: () => ({ getMany: async () => [] }) }),
        orderBy: () => ({ getMany: async () => [] }),
      })),
    };
    formsService = {
      findFormById: jest.fn(),
      createSubmissionForForm: jest.fn(),
    };
    whatsappService = { sendMessageForWorkspace: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        LandingPagesService,
        { provide: getRepositoryToken(LandingPage), useValue: repo },
        { provide: FormsService, useValue: formsService },
        { provide: WhatsAppService, useValue: whatsappService },
      ],
    }).compile();

    service = moduleRef.get(LandingPagesService);
  });

  it('rejects a duplicate slug on create', async () => {
    repo.findOne.mockResolvedValueOnce({ id: 'existing' });
    await expect(
      service.create('u1', 'w1', { name: 'Promo', slug: 'promo' } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('stamps publishedAt when created active', async () => {
    repo.findOne.mockResolvedValueOnce(null);
    const saved = await service.create('u1', 'w1', {
      name: 'Promo',
      status: LandingPageStatus.ACTIVE,
    } as any);
    expect(saved.publishedAt).toBeInstanceOf(Date);
  });

  it('does not stamp publishedAt when created as draft', async () => {
    repo.findOne.mockResolvedValueOnce(null);
    const saved = await service.create('u1', 'w1', { name: 'Promo' } as any);
    expect(saved.publishedAt).toBeUndefined();
  });

  it('stamps publishedAt on first active transition and preserves it after', async () => {
    const page: any = {
      id: 'lp1',
      workspaceId: 'w1',
      slug: 'promo',
      status: LandingPageStatus.DRAFT,
      publishedAt: undefined,
    };
    repo.findOne.mockResolvedValue(page);
    await service.update('lp1', 'w1', { status: LandingPageStatus.ACTIVE } as any);
    const firstCall = repo.save.mock.calls[0][0];
    expect(firstCall.publishedAt).toBeInstanceOf(Date);
  });

  it('returns 404 for a non-active page on public fetch', async () => {
    repo.findOne.mockResolvedValueOnce(null);
    await expect(
      service.findPublicBySlug('promo', { countUnique: true }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bumps viewCount always and uniqueViewCount only when countUnique', async () => {
    const page: any = {
      id: 'lp1',
      slug: 'promo',
      status: LandingPageStatus.ACTIVE,
      viewCount: 5,
      uniqueViewCount: 2,
    };
    repo.findOne.mockResolvedValue(page);
    await service.findPublicBySlug('promo', { countUnique: false });
    expect(repo.update).toHaveBeenCalledWith('lp1', { viewCount: 6 });
    await service.findPublicBySlug('promo', { countUnique: true });
    expect(repo.update).toHaveBeenCalledWith('lp1', { viewCount: 6, uniqueViewCount: 3 });
  });

  it('native submit creates lead with LANDING_PAGE source and attempts whatsapp', async () => {
    const page: any = {
      id: 'lp1',
      workspaceId: 'w1',
      slug: 'promo',
      status: LandingPageStatus.ACTIVE,
      captureType: LandingPageCaptureType.NATIVE,
      formId: 'f1',
      submissionCount: 0,
      postSubmit: { successMessage: 'Thanks!', whatsapp: { enabled: true, message: 'Hi {{name}}' } },
    };
    repo.findOne.mockResolvedValue(page);
    const form = { id: 'f1', workspaceId: 'w1', fields: [{ id: 'p', type: 'phone' }] };
    formsService.findFormById.mockResolvedValue(form);
    formsService.createSubmissionForForm.mockResolvedValue({
      submission: { id: 's1', data: { p: '+15551234567' } },
      contact: { id: 'c1', firstName: 'Ana' },
    });

    const res = await service.submitPublic('promo', { data: { p: '+15551234567' } } as any, {});

    expect(formsService.createSubmissionForForm).toHaveBeenCalledWith(
      form,
      { p: '+15551234567' },
      expect.objectContaining({ trackingData: expect.objectContaining({ landingPageId: 'lp1' }) }),
      ContactSource.LANDING_PAGE,
    );
    expect(whatsappService.sendMessageForWorkspace).toHaveBeenCalled();
    expect(res.success).toBe(true);
    expect(res.successMessage).toBe('Thanks!');
  });

  it('native submit does not fail when whatsapp throws', async () => {
    const page: any = {
      id: 'lp1', workspaceId: 'w1', slug: 'promo', status: LandingPageStatus.ACTIVE,
      captureType: LandingPageCaptureType.NATIVE, formId: 'f1', submissionCount: 0,
      postSubmit: { whatsapp: { enabled: true, message: 'Hi' } },
    };
    repo.findOne.mockResolvedValue(page);
    formsService.findFormById.mockResolvedValue({ id: 'f1', workspaceId: 'w1', fields: [{ id: 'p', type: 'phone' }] });
    formsService.createSubmissionForForm.mockResolvedValue({
      submission: { id: 's1', data: { p: '+15551234567' } }, contact: { id: 'c1' },
    });
    whatsappService.sendMessageForWorkspace.mockRejectedValue(new Error('wa down'));

    const res = await service.submitPublic('promo', { data: { p: '+15551234567' } } as any, {});
    expect(res.success).toBe(true);
  });

  it('rejects native submit on a typeform page', async () => {
    repo.findOne.mockResolvedValue({
      id: 'lp1', slug: 'promo', status: LandingPageStatus.ACTIVE,
      captureType: LandingPageCaptureType.TYPEFORM,
    });
    await expect(
      service.submitPublic('promo', { data: {} } as any, {}),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('duplicate resets status, counters, publishedAt and gets a new slug', async () => {
    const orig: any = {
      id: 'lp1', name: 'Promo', slug: 'promo', workspaceId: 'w1',
      status: LandingPageStatus.ACTIVE, content: { benefits: ['x'] },
      captureType: LandingPageCaptureType.NATIVE, formId: 'f1',
      viewCount: 10, uniqueViewCount: 8, submissionCount: 4,
      publishedAt: new Date(), experimentId: 'e1', variantGroup: 'A',
    };
    repo.findOne.mockResolvedValueOnce(orig).mockResolvedValue(null);
    const copy = await service.duplicate('lp1', 'w1', 'u2');
    expect(copy.status).toBe(LandingPageStatus.DRAFT);
    expect(copy.viewCount).toBe(0);
    expect(copy.uniqueViewCount).toBe(0);
    expect(copy.submissionCount).toBe(0);
    expect(copy.publishedAt).toBeNull();
    expect(copy.slug).not.toBe('promo');
    expect(copy.slug).toContain('promo-copy');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest landing-pages.service --passWithNoTests=false`
Expected: FAIL with "Cannot find module './landing-pages.service'".

- [ ] **Step 3: Write the service implementation**

Create [landing-pages.service.ts](backend/src/landing-pages/landing-pages.service.ts):

```typescript
import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { nanoid } from 'nanoid';
import {
  LandingPage,
  LandingPageStatus,
  LandingPageCaptureType,
} from '../database/entities/landing-page.entity';
import { ContactSource } from '../database/entities/contact.entity';
import { FormsService } from '../forms/forms.service';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';
import { CreateLandingPageDto } from './dto/create-landing-page.dto';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto';
import { SubmitLandingPageDto } from './dto/submit-landing-page.dto';

export interface LandingPageSubmitResult {
  success: boolean;
  successMessage?: string;
  redirectUrl?: string;
}

@Injectable()
export class LandingPagesService {
  private readonly logger = new Logger(LandingPagesService.name);

  constructor(
    @InjectRepository(LandingPage)
    private readonly landingPageRepository: Repository<LandingPage>,
    private readonly formsService: FormsService,
    private readonly whatsappService: WhatsAppService,
  ) {}

  async create(
    userId: string,
    workspaceId: string,
    dto: CreateLandingPageDto,
  ): Promise<LandingPage> {
    const slug = dto.slug
      ? await this.assertSlugFree(dto.slug)
      : await this.generateUniqueSlug(dto.name);

    const page = this.landingPageRepository.create({
      ...dto,
      slug,
      workspaceId,
      createdById: userId,
      viewCount: 0,
      uniqueViewCount: 0,
      submissionCount: 0,
    });

    if (dto.status === LandingPageStatus.ACTIVE) {
      page.publishedAt = new Date();
    }

    return this.landingPageRepository.save(page);
  }

  async findAll(workspaceId: string, status?: LandingPageStatus): Promise<LandingPage[]> {
    const query = this.landingPageRepository
      .createQueryBuilder('lp')
      .where('lp.workspaceId = :workspaceId', { workspaceId });

    if (status) {
      query.andWhere('lp.status = :status', { status });
    }

    return query.orderBy('lp.createdAt', 'DESC').getMany();
  }

  async findOne(id: string, workspaceId: string): Promise<LandingPage> {
    const page = await this.landingPageRepository.findOne({
      where: { id, workspaceId },
    });
    if (!page) {
      throw new NotFoundException('Landing page not found');
    }
    return page;
  }

  async update(
    id: string,
    workspaceId: string,
    dto: UpdateLandingPageDto,
  ): Promise<LandingPage> {
    const page = await this.findOne(id, workspaceId);

    if (dto.slug && dto.slug !== page.slug) {
      await this.assertSlugFree(dto.slug);
    }

    const becomingActive =
      dto.status === LandingPageStatus.ACTIVE && !page.publishedAt;

    Object.assign(page, dto);

    if (becomingActive) {
      page.publishedAt = new Date();
    }

    return this.landingPageRepository.save(page);
  }

  async remove(id: string, workspaceId: string): Promise<void> {
    const page = await this.findOne(id, workspaceId);
    await this.landingPageRepository.remove(page);
  }

  async duplicate(id: string, workspaceId: string, userId: string): Promise<LandingPage> {
    const orig = await this.findOne(id, workspaceId);
    const slug = await this.generateUniqueSlug(`${orig.slug}-copy`);

    const copy = this.landingPageRepository.create({
      name: `${orig.name} (copy)`,
      slug,
      status: LandingPageStatus.DRAFT,
      content: orig.content,
      captureType: orig.captureType,
      formId: orig.formId,
      typeformConfig: orig.typeformConfig,
      postSubmit: orig.postSubmit,
      seo: orig.seo,
      experimentId: orig.experimentId,
      variantGroup: orig.variantGroup,
      viewCount: 0,
      uniqueViewCount: 0,
      submissionCount: 0,
      lastSubmittedAt: null,
      publishedAt: null,
      workspaceId,
      createdById: userId,
    });

    return this.landingPageRepository.save(copy);
  }

  async findPublicBySlug(
    slug: string,
    opts: { countUnique: boolean },
  ): Promise<LandingPage> {
    const page = await this.landingPageRepository.findOne({
      where: { slug, status: LandingPageStatus.ACTIVE },
    });
    if (!page) {
      throw new NotFoundException('Landing page not found');
    }

    const updates: Partial<LandingPage> = { viewCount: page.viewCount + 1 };
    if (opts.countUnique) {
      updates.uniqueViewCount = page.uniqueViewCount + 1;
    }
    await this.landingPageRepository.update(page.id, updates);

    return page;
  }

  async submitPublic(
    slug: string,
    dto: SubmitLandingPageDto,
    metadata: { ipAddress?: string; userAgent?: string; referrer?: string },
  ): Promise<LandingPageSubmitResult> {
    const page = await this.landingPageRepository.findOne({
      where: { slug, status: LandingPageStatus.ACTIVE },
    });
    if (!page) {
      throw new NotFoundException('Landing page not found');
    }

    if (page.captureType !== LandingPageCaptureType.NATIVE) {
      throw new BadRequestException('This landing page does not accept native submissions');
    }
    if (!page.formId) {
      throw new BadRequestException('No form configured for this landing page');
    }

    const form = await this.formsService.findFormById(page.formId, page.workspaceId);
    if (!form) {
      throw new BadRequestException('The form for this landing page is unavailable');
    }

    const trackingData = {
      ...(dto.trackingData || {}),
      landingPageId: page.id,
      ...(page.experimentId ? { experimentId: page.experimentId } : {}),
      ...(page.variantGroup ? { variantGroup: page.variantGroup } : {}),
    };

    const { submission, contact } = await this.formsService.createSubmissionForForm(
      form,
      dto.data,
      { ...metadata, trackingData },
      ContactSource.LANDING_PAGE,
    );

    await this.landingPageRepository.update(page.id, {
      submissionCount: page.submissionCount + 1,
      lastSubmittedAt: new Date(),
    });

    await this.maybeSendWhatsAppWelcome(page, form, submission, contact);

    return {
      success: true,
      successMessage: page.postSubmit?.successMessage,
      redirectUrl: page.postSubmit?.redirectUrl,
    };
  }

  private async maybeSendWhatsAppWelcome(
    page: LandingPage,
    form: any,
    submission: any,
    contact: any,
  ): Promise<void> {
    try {
      if (!page.postSubmit?.whatsapp?.enabled || !page.postSubmit.whatsapp.message) {
        return;
      }
      const phoneField = form.fields?.find((f: any) => f.type === 'phone');
      const phone = phoneField ? submission.data?.[phoneField.id] : undefined;
      if (!phone) {
        return;
      }

      const name = contact?.firstName || '';
      const message = page.postSubmit.whatsapp.message.replace(/\{\{\s*name\s*\}\}/g, name);

      await this.whatsappService.sendMessageForWorkspace(page.workspaceId, {
        to: String(phone),
        type: 'text',
        content: message,
      });
    } catch (error: any) {
      this.logger.error(
        `WhatsApp welcome for landing page ${page.id} failed (submit still succeeded): ${error?.message}`,
      );
    }
  }

  private async assertSlugFree(slug: string): Promise<string> {
    const existing = await this.landingPageRepository.findOne({ where: { slug } });
    if (existing) {
      throw new BadRequestException('A landing page with this slug already exists');
    }
    return slug;
  }

  private async generateUniqueSlug(source: string): Promise<string> {
    const base = source
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return `${base}-${nanoid(6)}`;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest landing-pages.service`
Expected: PASS (all specs green).

- [ ] **Step 5: Commit**

```bash
git add backend/src/landing-pages/landing-pages.service.ts backend/src/landing-pages/landing-pages.service.spec.ts
git commit -m "feat(landing-pages): add service with CRUD, view tracking, native submit"
```

---

## Task 8: LandingPagesController + module + registration

The controller exposes JWT CRUD (opt-in via `@UseGuards(JwtAuthGuard)`), the duplicate endpoint, and two public slug routes. There is **no** global `APP_GUARD` in this app — routes are public-by-default and JWT is opt-in (same as the forms controller), so the public routes need no decorator at all. The public GET implements per-visitor-per-day dedup via a cookie (`lp_v_{slug}`) and skips bot user-agents for unique counts. cookie-parser is already enabled in `main.ts:75`, so `req.cookies` is available.

**Files:**
- Create: `backend/src/landing-pages/landing-pages.controller.ts`
- Create: `backend/src/landing-pages/landing-pages.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write the controller**

Create [landing-pages.controller.ts](backend/src/landing-pages/landing-pages.controller.ts):

```typescript
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Res,
  Query,
  Ip,
  Headers,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LandingPagesService } from './landing-pages.service';
import { CreateLandingPageDto } from './dto/create-landing-page.dto';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto';
import { SubmitLandingPageDto } from './dto/submit-landing-page.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LandingPageStatus } from '../database/entities/landing-page.entity';
import { THEME_PRESETS } from './theme-presets';

const BOT_UA = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|preview/i;

@Controller('landing-pages')
export class LandingPagesController {
  constructor(private readonly landingPagesService: LandingPagesService) {}

  @Get('theme-presets')
  @UseGuards(JwtAuthGuard)
  getThemePresets() {
    return THEME_PRESETS;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req, @Body() dto: CreateLandingPageDto) {
    return this.landingPagesService.create(req.user.id, req.user.workspaceId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Req() req, @Query('status') status?: LandingPageStatus) {
    return this.landingPagesService.findAll(req.user.workspaceId, status);
  }

  @Get('public/:slug')
  async findBySlug(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    const cookieName = `lp_v_${slug}`;
    const alreadyViewed = Boolean((req as any).cookies?.[cookieName]);
    const isBot = BOT_UA.test(userAgent || '');
    const countUnique = !alreadyViewed && !isBot;

    if (countUnique) {
      res.cookie(cookieName, '1', {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
      });
    }

    return this.landingPagesService.findPublicBySlug(slug, { countUnique });
  }

  @Post('public/:slug/submit')
  submit(
    @Param('slug') slug: string,
    @Body() dto: SubmitLandingPageDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('referer') referrer: string,
  ) {
    return this.landingPagesService.submitPublic(slug, dto, {
      ipAddress: ip,
      userAgent,
      referrer,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Req() req, @Param('id') id: string) {
    return this.landingPagesService.findOne(id, req.user.workspaceId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Req() req, @Param('id') id: string, @Body() dto: UpdateLandingPageDto) {
    return this.landingPagesService.update(id, req.user.workspaceId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Req() req, @Param('id') id: string) {
    return this.landingPagesService.remove(id, req.user.workspaceId);
  }

  @Post(':id/duplicate')
  @UseGuards(JwtAuthGuard)
  duplicate(@Req() req, @Param('id') id: string) {
    return this.landingPagesService.duplicate(id, req.user.workspaceId, req.user.id);
  }
}
```

> Routes are public-by-default in this app (verified: no `APP_GUARD` in `app.module.ts`), so the two `public/:slug` routes correctly need no guard/decorator — exactly like the forms controller.

- [ ] **Step 2: Write the module**

Create [landing-pages.module.ts](backend/src/landing-pages/landing-pages.module.ts):

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LandingPagesService } from './landing-pages.service';
import { LandingPagesController } from './landing-pages.controller';
import { LandingPage } from '../database/entities/landing-page.entity';
import { FormsModule } from '../forms/forms.module';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LandingPage]),
    FormsModule,
    WhatsAppModule,
  ],
  controllers: [LandingPagesController],
  providers: [LandingPagesService],
  exports: [LandingPagesService],
})
export class LandingPagesModule {}
```

> `WhatsAppModule` lives at `backend/src/integrations/whatsapp/whatsapp.module.ts` and `exports: [WhatsAppService]` (verified), so importing it is sufficient.

- [ ] **Step 3: Register in app.module**

In [app.module.ts](backend/src/app.module.ts), add the import near the `FormsModule` import (line ~31) and add `LandingPagesModule` to the `imports` array near `FormsModule` (line ~169):

```typescript
import { LandingPagesModule } from './landing-pages/landing-pages.module';
```
```typescript
    FormsModule,
    LandingPagesModule,
```

- [ ] **Step 4: Typecheck + boot**

Run: `cd backend && npx tsc --noEmit`
Expected: PASS.

Then verify the module wires up without DI errors by starting the app briefly:
Run: `cd backend && (npm run start:dev &) ; sleep 25 ; curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/health ; pkill -f "nest start" || true`
Expected: `200`, and the startup log lists `LandingPagesController {/api/v1/landing-pages}` routes with no `Nest can't resolve dependencies` error.

- [ ] **Step 5: Commit**

```bash
git add backend/src/landing-pages/landing-pages.controller.ts backend/src/landing-pages/landing-pages.module.ts backend/src/app.module.ts
git commit -m "feat(landing-pages): add controller + module, register in app"
```

---

## Task 9: Frontend types

Mirror the existing `frontend/types/form.ts` convention. The frontend calls the bare axios instance directly (`import api from '@/lib/api'; api.get('/landing-pages')`) — no separate api wrapper file is needed.

**Files:**
- Create: `frontend/types/landing-page.ts`

- [ ] **Step 1: Write the types**

Create [landing-page.ts](frontend/types/landing-page.ts):

```typescript
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

export interface LandingPage {
  id: string;
  name: string;
  slug: string;
  status: LandingPageStatus;
  content?: LandingPageContent;
  captureType: LandingPageCaptureType;
  formId?: string;
  typeformConfig?: LandingPageTypeformConfig;
  postSubmit?: LandingPagePostSubmit;
  viewCount: number;
  uniqueViewCount: number;
  submissionCount: number;
  lastSubmittedAt?: string;
  publishedAt?: string;
  seo?: LandingPageSeo;
  experimentId?: string;
  variantGroup?: string;
  conversionRate?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ThemePreset {
  key: string;
  label: string;
  theme: LandingPageTheme;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add frontend/types/landing-page.ts
git commit -m "feat(landing-pages): add frontend types"
```

---

## Task 10: Dashboard list page

**Files:**
- Create: `frontend/app/(dashboard)/landing-pages/page.tsx`

- [ ] **Step 1: Write the list page**

Create [page.tsx](frontend/app/(dashboard)/landing-pages/page.tsx):

```tsx
'use client';

import { useState, useEffect } from 'react';
import { Plus, Layout, Eye, Edit, Trash2, Copy, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { LandingPage, LandingPageStatus } from '@/types/landing-page';

export default function LandingPagesPage() {
  const router = useRouter();
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<LandingPageStatus | 'all'>('all');

  useEffect(() => {
    fetchPages();
  }, [filterStatus]);

  const fetchPages = async () => {
    try {
      setIsLoading(true);
      const params = filterStatus !== 'all' ? { status: filterStatus } : {};
      const response = await api.get<LandingPage[]>('/landing-pages', { params });
      setPages(response.data);
    } catch (error) {
      console.error('Failed to fetch landing pages:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this landing page?')) return;
    try {
      await api.delete(`/landing-pages/${id}`);
      setPages(pages.filter((p) => p.id !== id));
    } catch (error) {
      console.error('Failed to delete landing page:', error);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const res = await api.post<LandingPage>(`/landing-pages/${id}/duplicate`);
      setPages([res.data, ...pages]);
    } catch (error) {
      console.error('Failed to duplicate landing page:', error);
    }
  };

  const copyPublicUrl = (slug: string) => {
    const url = `${window.location.origin}/p/${slug}`;
    navigator.clipboard.writeText(url);
    alert('Public URL copied!');
  };

  const statusColor = (status: LandingPageStatus) => {
    switch (status) {
      case LandingPageStatus.ACTIVE:
        return 'bg-green-100 text-green-700';
      case LandingPageStatus.DRAFT:
        return 'bg-yellow-100 text-yellow-700';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Landing Pages</h1>
          <p className="text-gray-500">Public pages that capture leads into your CRM.</p>
        </div>
        <button
          onClick={() => router.push('/landing-pages/new')}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
        >
          <Plus size={18} /> New Landing Page
        </button>
      </div>

      <div className="mb-4 flex gap-2">
        {(['all', 'active', 'draft', 'archived'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilterStatus(s as any)}
            className={`rounded-full px-3 py-1 text-sm capitalize ${
              filterStatus === s ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : pages.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center text-gray-500">
          <Layout className="mx-auto mb-3" />
          No landing pages yet. Create your first one.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {pages.map((p) => (
            <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">{p.name}</h3>
                <span className={`rounded-full px-2 py-0.5 text-xs capitalize ${statusColor(p.status)}`}>
                  {p.status}
                </span>
              </div>
              <p className="mb-3 text-sm text-gray-400">/p/{p.slug}</p>
              <div className="mb-4 grid grid-cols-3 gap-2 text-center text-sm">
                <div>
                  <div className="font-semibold text-gray-900">{p.uniqueViewCount || p.viewCount}</div>
                  <div className="text-gray-400">Views</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-900">{p.submissionCount}</div>
                  <div className="text-gray-400">Leads</div>
                </div>
                <div>
                  <div className="font-semibold text-gray-900">
                    {(p.conversionRate ?? 0).toFixed(1)}%
                  </div>
                  <div className="text-gray-400">Conv.</div>
                </div>
              </div>
              {p.publishedAt && (
                <p className="mb-3 text-xs text-gray-400">
                  Published {new Date(p.publishedAt).toLocaleDateString()}
                </p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => router.push(`/landing-pages/${p.id}/edit`)}
                  className="inline-flex items-center gap-1 rounded-lg bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200"
                >
                  <Edit size={14} /> Edit
                </button>
                <button onClick={() => copyPublicUrl(p.slug)} title="Copy URL" className="rounded-lg bg-gray-100 p-2 hover:bg-gray-200">
                  <ExternalLink size={14} />
                </button>
                <button onClick={() => handleDuplicate(p.id)} title="Duplicate" className="rounded-lg bg-gray-100 p-2 hover:bg-gray-200">
                  <Copy size={14} />
                </button>
                <button onClick={() => handleDelete(p.id)} title="Delete" className="rounded-lg bg-red-50 p-2 text-red-600 hover:bg-red-100">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Verify in browser**

Run: `cd frontend && npm run dev` (and backend running). Log in, navigate to `http://localhost:3001/landing-pages`.
Expected: empty-state card renders; "New Landing Page" button routes to `/landing-pages/new` (404 until Task 11 — that's fine for now). No console errors fetching `/landing-pages` (returns `[]`).

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/(dashboard)/landing-pages/page.tsx"
git commit -m "feat(landing-pages): add dashboard list page"
```

---

## Task 11: Editor component + new/edit pages

A single shared editor component (live preview side-by-side) is used by both the create and edit routes to avoid duplication.

**Files:**
- Create: `frontend/app/(dashboard)/landing-pages/_components/LandingPageEditor.tsx`
- Create: `frontend/app/(dashboard)/landing-pages/new/page.tsx`
- Create: `frontend/app/(dashboard)/landing-pages/[id]/edit/page.tsx`

- [ ] **Step 1: Write the shared editor component**

Create [LandingPageEditor.tsx](frontend/app/(dashboard)/landing-pages/_components/LandingPageEditor.tsx):

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import {
  LandingPage,
  LandingPageStatus,
  LandingPageCaptureType,
  ThemePreset,
} from '@/types/landing-page';

interface FormOption {
  id: string;
  name: string;
}

interface Props {
  initial?: LandingPage;
}

type Draft = Partial<LandingPage>;

export default function LandingPageEditor({ initial }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(
    initial || {
      name: '',
      status: LandingPageStatus.DRAFT,
      captureType: LandingPageCaptureType.NATIVE,
      content: { hero: { title: '', subtitle: '', accentColor: '#2563eb' }, benefits: [] },
      postSubmit: { successMessage: 'Thank you!', whatsapp: { enabled: false, message: '' } },
      seo: {},
    },
  );
  const [forms, setForms] = useState<FormOption[]>([]);
  const [presets, setPresets] = useState<ThemePreset[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<FormOption[]>('/forms').then((r) => setForms(r.data)).catch(() => {});
    api.get<ThemePreset[]>('/landing-pages/theme-presets').then((r) => setPresets(r.data)).catch(() => {});
  }, []);

  const hero = draft.content?.hero || {};
  const benefits = draft.content?.benefits || [];
  const theme = draft.content?.theme || {};

  const setHero = (patch: Partial<typeof hero>) =>
    setDraft((d) => ({ ...d, content: { ...d.content, hero: { ...d.content?.hero, ...patch } } }));
  const setBenefits = (next: string[]) =>
    setDraft((d) => ({ ...d, content: { ...d.content, benefits: next } }));
  const applyPreset = (key: string) => {
    const preset = presets.find((p) => p.key === key);
    setDraft((d) => ({
      ...d,
      content: { ...d.content, themePreset: key, theme: { ...(preset?.theme || {}) } },
    }));
  };

  const isTypeform = draft.captureType === LandingPageCaptureType.TYPEFORM;

  const canSaveActive = useMemo(() => {
    if (draft.status !== LandingPageStatus.ACTIVE) return true;
    if (isTypeform) return Boolean(draft.typeformConfig?.formId);
    return Boolean(draft.formId);
  }, [draft, isTypeform]);

  const save = async () => {
    setError(null);
    if (!draft.name?.trim()) {
      setError('Name is required.');
      return;
    }
    if (!canSaveActive) {
      setError(
        isTypeform
          ? 'Set a Typeform form ID before publishing.'
          : 'Select a form before publishing.',
      );
      return;
    }
    setSaving(true);
    try {
      if (initial?.id) {
        await api.patch(`/landing-pages/${initial.id}`, draft);
      } else {
        await api.post('/landing-pages', draft);
      }
      router.push('/landing-pages');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 p-4">
        <input
          value={draft.name || ''}
          onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          placeholder="Landing page name"
          className="w-1/2 rounded-lg border border-gray-200 px-3 py-2 text-lg font-semibold"
        />
        <div className="flex items-center gap-3">
          <select
            value={draft.status}
            onChange={(e) => setDraft({ ...draft, status: e.target.value as LandingPageStatus })}
            className="rounded-lg border border-gray-200 px-3 py-2"
          >
            <option value={LandingPageStatus.DRAFT}>Draft</option>
            <option value={LandingPageStatus.ACTIVE}>Active</option>
            <option value={LandingPageStatus.ARCHIVED}>Archived</option>
          </select>
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            <Save size={16} /> {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}

      <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-2">
        {/* EDITOR */}
        <div className="space-y-6 overflow-y-auto p-6">
          {/* Hero */}
          <section>
            <h3 className="mb-3 font-semibold text-gray-900">Hero</h3>
            <input
              value={hero.title || ''}
              onChange={(e) => setHero({ title: e.target.value })}
              placeholder="Headline"
              className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2"
            />
            <textarea
              value={hero.subtitle || ''}
              onChange={(e) => setHero({ subtitle: e.target.value })}
              placeholder="Subtitle"
              className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2"
            />
            <input
              value={hero.image || ''}
              onChange={(e) => setHero({ image: e.target.value })}
              placeholder="Hero image URL"
              className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2"
            />
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600">Accent</label>
              <input
                type="color"
                value={hero.accentColor || '#2563eb'}
                onChange={(e) => setHero({ accentColor: e.target.value })}
              />
            </div>
          </section>

          {/* Theme preset */}
          <section>
            <h3 className="mb-3 font-semibold text-gray-900">Theme preset</h3>
            <select
              value={draft.content?.themePreset || ''}
              onChange={(e) => applyPreset(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            >
              <option value="">Custom</option>
              {presets.map((p) => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
          </section>

          {/* Benefits */}
          <section>
            <h3 className="mb-3 font-semibold text-gray-900">Benefits</h3>
            {benefits.map((b, i) => (
              <div key={i} className="mb-2 flex gap-2">
                <input
                  value={b}
                  onChange={(e) => {
                    const next = [...benefits];
                    next[i] = e.target.value;
                    setBenefits(next);
                  }}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2"
                />
                <button onClick={() => setBenefits(benefits.filter((_, j) => j !== i))} className="rounded-lg bg-red-50 p-2 text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <button onClick={() => setBenefits([...benefits, ''])} className="inline-flex items-center gap-1 text-sm text-blue-600">
              <Plus size={14} /> Add benefit
            </button>
          </section>

          {/* Capture */}
          <section>
            <h3 className="mb-3 font-semibold text-gray-900">Capture block</h3>
            <div className="mb-3 flex gap-2">
              {[LandingPageCaptureType.NATIVE, LandingPageCaptureType.TYPEFORM].map((t) => (
                <button
                  key={t}
                  onClick={() => setDraft({ ...draft, captureType: t })}
                  className={`rounded-lg px-3 py-1.5 text-sm capitalize ${
                    draft.captureType === t ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {isTypeform ? (
              <input
                value={draft.typeformConfig?.formId || ''}
                onChange={(e) =>
                  setDraft({ ...draft, typeformConfig: { formId: e.target.value, embedType: 'inline' } })
                }
                placeholder="Typeform form ID"
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
              />
            ) : (
              <select
                value={draft.formId || ''}
                onChange={(e) => setDraft({ ...draft, formId: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
              >
                <option value="">Select a form…</option>
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            )}
          </section>

          {/* Post-submit (native only) */}
          {!isTypeform && (
            <section>
              <h3 className="mb-3 font-semibold text-gray-900">After submit</h3>
              <input
                value={draft.postSubmit?.successMessage || ''}
                onChange={(e) =>
                  setDraft({ ...draft, postSubmit: { ...draft.postSubmit, successMessage: e.target.value } })
                }
                placeholder="Success message"
                className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2"
              />
              <input
                value={draft.postSubmit?.redirectUrl || ''}
                onChange={(e) =>
                  setDraft({ ...draft, postSubmit: { ...draft.postSubmit, redirectUrl: e.target.value } })
                }
                placeholder="Redirect URL (optional)"
                className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2"
              />
              <label className="mb-2 flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={Boolean(draft.postSubmit?.whatsapp?.enabled)}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      postSubmit: {
                        ...draft.postSubmit,
                        whatsapp: { ...draft.postSubmit?.whatsapp, enabled: e.target.checked },
                      },
                    })
                  }
                />
                Send WhatsApp welcome
              </label>
              {draft.postSubmit?.whatsapp?.enabled && (
                <textarea
                  value={draft.postSubmit?.whatsapp?.message || ''}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      postSubmit: {
                        ...draft.postSubmit,
                        whatsapp: { ...draft.postSubmit?.whatsapp, message: e.target.value },
                      },
                    })
                  }
                  placeholder="Welcome message (use {{name}})"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2"
                />
              )}
            </section>
          )}

          {/* SEO + slug */}
          <section>
            <h3 className="mb-3 font-semibold text-gray-900">SEO &amp; URL</h3>
            <input
              value={draft.slug || ''}
              onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
              placeholder="Slug (auto-generated if blank)"
              className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2"
            />
            <input
              value={draft.seo?.title || ''}
              onChange={(e) => setDraft({ ...draft, seo: { ...draft.seo, title: e.target.value } })}
              placeholder="SEO title"
              className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2"
            />
            <textarea
              value={draft.seo?.description || ''}
              onChange={(e) => setDraft({ ...draft, seo: { ...draft.seo, description: e.target.value } })}
              placeholder="SEO description"
              className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2"
            />
            <input
              value={draft.seo?.ogImage || ''}
              onChange={(e) => setDraft({ ...draft, seo: { ...draft.seo, ogImage: e.target.value } })}
              placeholder="OG image URL"
              className="w-full rounded-lg border border-gray-200 px-3 py-2"
            />
          </section>
        </div>

        {/* PREVIEW */}
        <div
          className="overflow-y-auto p-10"
          style={{ background: theme.backgroundColor || '#f8fafc', color: theme.textColor || '#0f172a' }}
        >
          {hero.image && <img src={hero.image} alt="" className="mb-6 w-full rounded-xl object-cover" />}
          <h1 className="mb-3 text-3xl font-bold" style={{ color: hero.accentColor || theme.accentColor }}>
            {hero.title || 'Your headline here'}
          </h1>
          <p className="mb-6 text-lg opacity-80">{hero.subtitle || 'Your subtitle here'}</p>
          {benefits.length > 0 && (
            <ul className="mb-6 space-y-2">
              {benefits.map((b, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span style={{ color: hero.accentColor || theme.accentColor }}>✓</span> {b}
                </li>
              ))}
            </ul>
          )}
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-gray-900">
            {isTypeform ? (
              <p className="text-sm text-gray-500">
                Typeform embed ({draft.typeformConfig?.formId || 'no form ID'})
              </p>
            ) : (
              <p className="text-sm text-gray-500">
                Native form ({forms.find((f) => f.id === draft.formId)?.name || 'no form selected'})
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write the new page**

Create [new/page.tsx](frontend/app/(dashboard)/landing-pages/new/page.tsx):

```tsx
'use client';

import LandingPageEditor from '../_components/LandingPageEditor';

export default function NewLandingPage() {
  return (
    <div className="h-[calc(100vh-4rem)]">
      <LandingPageEditor />
    </div>
  );
}
```

- [ ] **Step 3: Write the edit page**

Create [[id]/edit/page.tsx](frontend/app/(dashboard)/landing-pages/[id]/edit/page.tsx):

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { LandingPage } from '@/types/landing-page';
import LandingPageEditor from '../../_components/LandingPageEditor';

export default function EditLandingPage() {
  const params = useParams();
  const id = params?.id as string;
  const [page, setPage] = useState<LandingPage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api
      .get<LandingPage>(`/landing-pages/${id}`)
      .then((r) => setPage(r.data))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="p-6 text-gray-500">Loading…</div>;
  if (!page) return <div className="p-6 text-gray-500">Landing page not found.</div>;

  return (
    <div className="h-[calc(100vh-4rem)]">
      <LandingPageEditor initial={page} />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Verify in browser**

With backend + frontend running: go to `/landing-pages/new`. Fill name "Test Promo", a headline, add a benefit, leave capture = native and select a form, set status = Active, Save.
Expected: redirects to `/landing-pages`, the new card appears with status Active. Click Edit → values reload. Switch to Typeform, set status Active without a form ID, Save → inline error "Set a Typeform form ID before publishing." Set an ID, Save → succeeds.

- [ ] **Step 6: Commit**

```bash
git add "frontend/app/(dashboard)/landing-pages/_components/LandingPageEditor.tsx" "frontend/app/(dashboard)/landing-pages/new/page.tsx" "frontend/app/(dashboard)/landing-pages/[id]/edit/page.tsx"
git commit -m "feat(landing-pages): add editor with live preview, new/edit pages"
```

---

## Task 12: Public render endpoint enrichment + `/p/[slug]` page

The public render needs the linked form's fields (native path) to draw inputs, and a no-track read for SEO metadata so `generateMetadata` doesn't double-bump views. Two design points:
- **Form attachment:** the GET returns `{ page, form }` where `form` is a trimmed public projection (`id`, `name`, `fields`, `settings`) or `null` when the form is missing → render shows "form unavailable".
- **SEO without counting:** `generateMetadata` fetches with `?track=false` (skips the view bump); the client render fetches normally (bumps raw view, and unique view via the cookie).

**Files:**
- Modify: `backend/src/landing-pages/landing-pages.service.ts`
- Modify: `backend/src/landing-pages/landing-pages.controller.ts`
- Modify: `backend/src/landing-pages/landing-pages.service.spec.ts`
- Create: `frontend/app/p/[slug]/page.tsx`
- Create: `frontend/app/p/[slug]/LandingPageRender.tsx`

- [ ] **Step 1: Add a failing test for `getPublicView` + `skipView`**

Append to [landing-pages.service.spec.ts](backend/src/landing-pages/landing-pages.service.spec.ts), inside the top-level `describe`:

```typescript
  it('getPublicView attaches the form for native pages', async () => {
    const page: any = {
      id: 'lp1', slug: 'promo', status: LandingPageStatus.ACTIVE,
      captureType: LandingPageCaptureType.NATIVE, formId: 'f1', workspaceId: 'w1',
      viewCount: 0, uniqueViewCount: 0,
    };
    repo.findOne.mockResolvedValue(page);
    formsService.findFormById.mockResolvedValue({
      id: 'f1', name: 'Lead form', fields: [{ id: 'e', type: 'email', label: 'Email' }], settings: {},
    });
    const res = await service.getPublicView('promo', { countUnique: true });
    expect(res.page.id).toBe('lp1');
    expect(res.form?.id).toBe('f1');
    expect(res.form?.fields).toHaveLength(1);
  });

  it('getPublicView returns null form when the referenced form is gone', async () => {
    const page: any = {
      id: 'lp1', slug: 'promo', status: LandingPageStatus.ACTIVE,
      captureType: LandingPageCaptureType.NATIVE, formId: 'gone', workspaceId: 'w1',
      viewCount: 0, uniqueViewCount: 0,
    };
    repo.findOne.mockResolvedValue(page);
    formsService.findFormById.mockResolvedValue(null);
    const res = await service.getPublicView('promo', { countUnique: false });
    expect(res.form).toBeNull();
  });

  it('skipView avoids bumping counters', async () => {
    const page: any = {
      id: 'lp1', slug: 'promo', status: LandingPageStatus.ACTIVE,
      captureType: LandingPageCaptureType.TYPEFORM, viewCount: 3, uniqueViewCount: 1,
    };
    repo.findOne.mockResolvedValue(page);
    await service.findPublicBySlug('promo', { countUnique: true, skipView: true });
    expect(repo.update).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest landing-pages.service`
Expected: FAIL — `service.getPublicView is not a function` and the skipView assertion failing.

- [ ] **Step 3: Update the service**

In [landing-pages.service.ts](backend/src/landing-pages/landing-pages.service.ts), update `findPublicBySlug` to accept `skipView`, and add `getPublicView`. Replace the existing `findPublicBySlug` method with:

```typescript
  async findPublicBySlug(
    slug: string,
    opts: { countUnique: boolean; skipView?: boolean },
  ): Promise<LandingPage> {
    const page = await this.landingPageRepository.findOne({
      where: { slug, status: LandingPageStatus.ACTIVE },
    });
    if (!page) {
      throw new NotFoundException('Landing page not found');
    }

    if (!opts.skipView) {
      const updates: Partial<LandingPage> = { viewCount: page.viewCount + 1 };
      if (opts.countUnique) {
        updates.uniqueViewCount = page.uniqueViewCount + 1;
      }
      await this.landingPageRepository.update(page.id, updates);
    }

    return page;
  }

  async getPublicView(
    slug: string,
    opts: { countUnique: boolean; skipView?: boolean },
  ): Promise<{
    page: LandingPage;
    form: { id: string; name: string; fields: any; settings: any } | null;
  }> {
    const page = await this.findPublicBySlug(slug, opts);
    let form: { id: string; name: string; fields: any; settings: any } | null = null;
    if (page.captureType === LandingPageCaptureType.NATIVE && page.formId) {
      const f = await this.formsService.findFormById(page.formId, page.workspaceId);
      if (f) {
        form = { id: f.id, name: f.name, fields: f.fields, settings: f.settings };
      }
    }
    return { page, form };
  }
```

- [ ] **Step 4: Update the controller GET to return the enriched view**

In [landing-pages.controller.ts](backend/src/landing-pages/landing-pages.controller.ts), replace the `findBySlug` handler with one that honors `?track=false` and returns `getPublicView`:

```typescript
  @Get('public/:slug')
  async findBySlug(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('user-agent') userAgent: string,
    @Query('track') track?: string,
  ) {
    const skipView = track === 'false';
    const cookieName = `lp_v_${slug}`;
    const alreadyViewed = Boolean((req as any).cookies?.[cookieName]);
    const isBot = BOT_UA.test(userAgent || '');
    const countUnique = !alreadyViewed && !isBot;

    if (!skipView && countUnique) {
      res.cookie(cookieName, '1', {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
      });
    }

    return this.landingPagesService.getPublicView(slug, { countUnique, skipView });
  }
```

Remove the now-unused `@Ip() ip` param and the `Ip` import if it is no longer referenced anywhere else in the controller (the submit handler still uses `@Ip`, so keep the import).

- [ ] **Step 5: Run backend tests**

Run: `cd backend && npx jest landing-pages.service`
Expected: PASS (all specs, including the three new ones).

- [ ] **Step 6: Write the public server page with `generateMetadata`**

Create [p/[slug]/page.tsx](frontend/app/p/[slug]/page.tsx):

```tsx
import { Metadata } from 'next';
import LandingPageRender from './LandingPageRender';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'https://slackcrm-backend.fly.dev/api/v1';

async function fetchView(slug: string) {
  try {
    const res = await fetch(`${API_BASE}/landing-pages/public/${slug}?track=false`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const view = await fetchView(slug);
  const page = view?.page;
  if (!page) return { title: 'Landing page' };

  const hero = page.content?.hero || {};
  const benefits = page.content?.benefits || [];
  const seo = page.seo || {};
  const title = seo.title || hero.title || page.name;
  const description = seo.description || hero.subtitle || benefits[0] || undefined;
  const ogImage = seo.ogImage || hero.image || undefined;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: ogImage ? [{ url: ogImage }] : undefined,
    },
  };
}

export default async function PublicLandingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const view = await fetchView(slug);

  if (!view?.page) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-500">
        This page is not available.
      </div>
    );
  }

  return <LandingPageRender slug={slug} initialPage={view.page} initialForm={view.form} />;
}
```

> Next 15 passes `params` as a Promise in async server components — the `await params` above is required. If this project still uses sync params (check another `[slug]` route under `app/`), drop the `Promise<>` wrapper and `await`.

- [ ] **Step 7: Write the client render**

Create [p/[slug]/LandingPageRender.tsx](frontend/app/p/[slug]/LandingPageRender.tsx):

```tsx
'use client';

import { useEffect, useMemo, useState } from 'react';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || 'https://slackcrm-backend.fly.dev/api/v1';

interface FormField {
  id: string;
  type: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
}

interface PublicForm {
  id: string;
  name: string;
  fields: FormField[];
  settings?: any;
}

interface Props {
  slug: string;
  initialPage: any;
  initialForm: PublicForm | null;
}

function readUtms(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const q = new URLSearchParams(window.location.search);
  const out: Record<string, string> = {};
  ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach((k) => {
    const v = q.get(k);
    if (v) out[k] = v;
  });
  if (document.referrer) out.referrer = document.referrer;
  return out;
}

export default function LandingPageRender({ slug, initialPage, initialForm }: Props) {
  const page = initialPage;
  const form = initialForm;
  const hero = page.content?.hero || {};
  const benefits: string[] = page.content?.benefits || [];
  const theme = page.content?.theme || {};
  const isTypeform = page.captureType === 'typeform';

  const [values, setValues] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ message?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const utms = useMemo(() => readUtms(), []);

  // Fire a tracked view (raw + unique cookie dedup) once on mount.
  useEffect(() => {
    fetch(`${API_BASE}/landing-pages/public/${slug}`, { credentials: 'include' }).catch(() => {});
  }, [slug]);

  const typeformSrc = useMemo(() => {
    if (!isTypeform || !page.typeformConfig?.formId) return '';
    const qs = new URLSearchParams(utms).toString();
    return `https://form.typeform.com/to/${page.typeformConfig.formId}${qs ? `#${qs}` : ''}`;
  }, [isTypeform, page.typeformConfig, utms]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/landing-pages/public/${slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: values, trackingData: utms }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'Submission failed');
      }
      const body = await res.json();
      if (body.redirectUrl) {
        window.location.href = body.redirectUrl;
        return;
      }
      setDone({ message: body.successMessage || 'Thank you!' });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const accent = hero.accentColor || theme.accentColor || '#2563eb';

  return (
    <div
      className="min-h-screen px-6 py-12"
      style={{ background: theme.backgroundColor || '#f8fafc', color: theme.textColor || '#0f172a' }}
    >
      <div className="mx-auto max-w-2xl">
        {hero.logo && <img src={hero.logo} alt="" className="mb-8 h-10" />}
        {hero.image && <img src={hero.image} alt="" className="mb-8 w-full rounded-2xl object-cover" />}
        <h1 className="mb-4 text-4xl font-bold" style={{ color: accent }}>
          {hero.title}
        </h1>
        {hero.subtitle && <p className="mb-8 text-xl opacity-80">{hero.subtitle}</p>}

        {benefits.length > 0 && (
          <ul className="mb-10 space-y-3">
            {benefits.map((b, i) => (
              <li key={i} className="flex items-start gap-2 text-lg">
                <span style={{ color: accent }}>✓</span> {b}
              </li>
            ))}
          </ul>
        )}

        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-gray-900 shadow-sm">
          {isTypeform ? (
            page.typeformConfig?.formId ? (
              <iframe
                title="Typeform"
                src={typeformSrc}
                className="h-[500px] w-full rounded-xl border-0"
              />
            ) : (
              <p className="text-gray-500">Form unavailable.</p>
            )
          ) : !form ? (
            <p className="text-gray-500">Form unavailable.</p>
          ) : done ? (
            <p className="text-center text-lg font-medium" style={{ color: accent }}>
              {done.message}
            </p>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {form.fields.map((f) => (
                <div key={f.id}>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    {f.label}
                    {f.required && <span className="text-red-500"> *</span>}
                  </label>
                  {f.type === 'textarea' ? (
                    <textarea
                      required={f.required}
                      placeholder={f.placeholder}
                      value={values[f.id] || ''}
                      onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2"
                    />
                  ) : f.type === 'select' ? (
                    <select
                      required={f.required}
                      value={values[f.id] || ''}
                      onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2"
                    >
                      <option value="">Select…</option>
                      {(f.options || []).map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : f.type === 'number' ? 'number' : 'text'}
                      required={f.required}
                      placeholder={f.placeholder}
                      value={values[f.id] || ''}
                      onChange={(e) => setValues({ ...values, [f.id]: e.target.value })}
                      className="w-full rounded-lg border border-gray-200 px-3 py-2"
                    />
                  )}
                </div>
              ))}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-lg px-4 py-3 font-medium text-white disabled:opacity-60"
                style={{ background: accent }}
              >
                {submitting ? 'Submitting…' : form.settings?.submitButtonText || 'Submit'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Typecheck + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: PASS; build output lists the `/p/[slug]` route.

- [ ] **Step 9: Verify end-to-end in browser**

With backend + frontend running and an Active native landing page from Task 11 (slug e.g. `test-promo-xxxxxx`):
1. Open `http://localhost:3001/p/<slug>?utm_source=test&utm_campaign=launch`.
   Expected: hero + benefits + native form render. View tab title = SEO/hero title.
2. Submit the form with an email + phone.
   Expected: success message shows (or redirect). A new contact appears in the CRM Leads/Contacts with source = landing_page; the submission's `trackingData` contains `utm_source: 'test'`, `utm_campaign: 'launch'`, `landingPageId`.
3. Refresh the page.
   Expected: raw `viewCount` increases each load; `uniqueViewCount` only once (cookie set).
4. Open a draft/archived page's slug → "This page is not available."
5. For a Typeform page, the iframe renders with the UTM params in the `src` hash.

- [ ] **Step 10: Commit**

```bash
git add backend/src/landing-pages/landing-pages.service.ts backend/src/landing-pages/landing-pages.controller.ts backend/src/landing-pages/landing-pages.service.spec.ts "frontend/app/p/[slug]/page.tsx" "frontend/app/p/[slug]/LandingPageRender.tsx"
git commit -m "feat(landing-pages): public /p/[slug] render + SEO metadata + view tracking"
```

---

## Task 13: Sidebar navigation link

The sidebar groups Campaigns/Automation/Forms together; add "Landing Pages" to that group next to Forms.

**Files:**
- Modify: `frontend/components/layout/Sidebar.tsx`

- [ ] **Step 1: Import the icon**

In [Sidebar.tsx](frontend/components/layout/Sidebar.tsx), add `Layout` to the `lucide-react` import block (alongside `FileText`, `Mail`, etc.):

```typescript
  CreditCard,
  Layout,
```

- [ ] **Step 2: Add the nav item to the campaigns group**

In `campaignsNavigation` (after the `Forms` entry):

```typescript
const campaignsNavigation: NavigationItem[] = [
  { name: 'Campaigns', href: '/email-campaigns', icon: Mail, color: 'from-sky-500 to-indigo-500' },
  { name: 'Automation', href: '/automation', icon: Bot, color: 'from-violet-500 to-fuchsia-500' },
  { name: 'Forms', href: '/forms', icon: FileText, color: 'from-emerald-500 to-green-500' },
  { name: 'Landing Pages', href: '/landing-pages', icon: Layout, color: 'from-fuchsia-500 to-pink-500' },
] ;
```

- [ ] **Step 3: Register the href as grouped**

Add `'/landing-pages'` to the `groupedNavigationHrefs` set, next to `'/forms'`:

```typescript
  '/automation',
  '/forms',
  '/landing-pages',
```

- [ ] **Step 4: Keep the group expanded on landing-pages routes**

Update BOTH places that compute the campaigns-open state to include `/landing-pages`:

The `useState` initializer:
```typescript
  const [isCampaignsOpen, setIsCampaignsOpen] = useState(
    pathname.startsWith('/email-campaigns') || pathname.startsWith('/automation') || pathname.startsWith('/forms') || pathname.startsWith('/landing-pages'),
  );
```

The `useEffect`:
```typescript
    if (pathname.startsWith('/email-campaigns') || pathname.startsWith('/automation') || pathname.startsWith('/forms') || pathname.startsWith('/landing-pages')) {
      setIsCampaignsOpen(true);
    }
```

- [ ] **Step 5: Typecheck + verify**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

In the browser, open the dashboard, expand the Campaigns group → "Landing Pages" appears and links to `/landing-pages`; navigating there keeps the group open and highlights the item.

- [ ] **Step 6: Commit**

```bash
git add frontend/components/layout/Sidebar.tsx
git commit -m "feat(landing-pages): add sidebar navigation link"
```

---

## Final verification

- [ ] **Full backend typecheck + landing-pages tests**

Run: `cd backend && npx tsc --noEmit && npx jest landing-pages`
Expected: PASS.

- [ ] **Full frontend typecheck + build**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: PASS; `/p/[slug]` and `/landing-pages` routes present in build output.

- [ ] **Deploy (only when the user asks)**

Backend (manual — Fly does not auto-deploy): `cd backend && ~/.fly/bin/flyctl deploy -a slackcrm-backend`. The migration runs automatically on boot (`migrationsRun: true`). Frontend auto-deploys on git push to `main` (Netlify). Do NOT deploy without explicit user confirmation.

---

## Spec coverage self-review

Checked against `docs/superpowers/specs/2026-06-09-landing-pages-design.md`:

- Entity + all fields (slug, status, content, captureType, formId, typeformConfig, postSubmit, view/unique/submission counters, publishedAt, seo, experimentId, variantGroup, createdById, conversionRate getter) → Task 2. ✅
- Migration + `ContactSource.LANDING_PAGE` → Tasks 1, 3. ✅
- Indexes (unique slug, composite workspace+status) → Tasks 2, 3. ✅
- Protected CRUD + duplicate; public GET (bump views) + public submit (native only) → Tasks 7, 8. ✅
- Native submit reuses forms validation + contact creation (shared `createSubmissionForForm`), source = LANDING_PAGE → Tasks 5, 7. ✅
- WhatsApp welcome guarded by try/catch, phone+enabled gate, never fails submit → Task 7 (`maybeSendWhatsAppWelcome`) + test. ✅
- UTM tracking persisted in `FormSubmission.trackingData` (native) + forwarded on Typeform iframe `src` → Tasks 7, 12. ✅
- SEO `generateMetadata` with fallbacks → Task 12. ✅
- `publishedAt` first-active stamp, preserved later → Task 7 + tests. ✅
- View tracking: raw always, unique via per-day cookie, bots skipped, conversion uses unique → Tasks 7, 8. ✅
- Theme presets fixed catalog, selectable, still editable → Tasks 4, 11. ✅
- A/B hooks stored + surfaced in submission trackingData → Tasks 2, 7. ✅
- Duplication deep-copy, new slug, reset counters/status/publishedAt → Task 7 + test. ✅
- Edge cases: duplicate slug 400, draft/archived 404, no-phone skips WhatsApp, typeform-without-id blocks active save, deleted formId → "form unavailable", whatsapp failure swallowed → Tasks 7, 8, 11, 12 + tests. ✅
- Frontend: dashboard list/editor/new + public `/p/[slug]` → Tasks 10, 11, 12. ✅

**Placeholder scan:** none — every code step has complete code.
**Type consistency:** `LandingPageStatus`/`LandingPageCaptureType` enums, `createSubmissionForForm`/`findFormById`/`findPublicBySlug`/`getPublicView`/`submitPublic`/`duplicate` signatures, and the `{ page, form }` public shape are consistent across backend and frontend tasks.

Out-of-scope items (drag-drop builder, custom domains, funnels, workflow triggers, A/B traffic splitting, custom preset authoring) are intentionally excluded.
