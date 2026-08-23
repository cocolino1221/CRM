# Webinar Lead Funnel (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a lead who submits a landing page get auto-enrolled in a reusable "funnel" that sends a WhatsApp confirmation instantly, a WhatsApp/email reminder timed off a webinar `anchorDate`, and branches to a thank-you or no-show step based on a manual "mark attended" toggle.

**Architecture:** Reuses the existing, already-durable WhatsApp `conversationFlows` engine (Bull-backed, survives restarts) instead of building a parallel scheduling system. Three small additions to `whatsapp.service.ts` (an `email` step type, a public `startFlowForWorkspace` entry point, and an explicit-target-step variant of the existing follow-up-timer mechanism) do all the step execution and durable delay work. A new, thin `Funnel`/`FunnelEnrollment` pair of entities gives the funnel a reusable identity, holds the per-run `anchorDate`, and tracks per-contact progress — it contains no scheduling logic of its own.

**Deviation from the committed spec, and why:** The spec (`docs/superpowers/specs/2026-08-23-webinar-lead-funnel-design.md`) proposed a `condition: { basedOn: 'attended', trueNextStepId, falseNextStepId }` field on a step. While implementing against the actual `handleFollowupTimeout`/`timeoutBranch` code, a simpler equivalent fell out: the *existing* `timeoutBranch` on the "attended?" step already gives the no-show fallback (a plain grace-period timeout to the no-show step, authored with zero new code in the existing flow editor), and a new explicit-target durable-arm method (delay 0) gives the "attended" branch. This needs no new `condition` schema field and reuses one mechanism for three different jobs. Functionally equivalent to the spec's intent; documented here since it changes what Task 3 and Task 7 actually build compared to the spec's literal wording.

**Tech Stack:** NestJS, TypeORM (Postgres/Neon), Bull/Redis (`QUEUE_NAMES.SCHEDULED_TASKS`), Jest, Next.js 15 App Router, axios.

**Spec:** `docs/superpowers/specs/2026-08-23-webinar-lead-funnel-design.md`

## Global Constraints

- Never use `synchronize: true`; all schema changes go through a migration in `backend/src/database/migrations/`, following the raw-SQL `DO $$ ... EXCEPTION ... END $$` pattern already used in this repo (idempotent `CREATE TYPE`/`ADD CONSTRAINT`).
- All new entities extend `WorkspaceEntity` (adds `workspaceId`, `id`, `createdAt`, `updatedAt`, `deletedAt`) per `backend/src/database/entities/base.entity.ts`.
- Durable delays (anything that must survive a Fly redeploy) MUST go through Bull (`QUEUE_NAMES.SCHEDULED_TASKS`), never `setTimeout` — this is why Task 2/3 extend the existing `WhatsAppFollowupDispatchService` instead of adding a new in-process timer.
- WhatsApp "groups" are not a real capability of the Cloud API and must not be used anywhere in this feature — all WhatsApp touchpoints are 1:1 templated/text sends via the existing flow engine.
- Follow this repo's TDD convention for backend service/logic changes: write the failing Jest test first (`*.spec.ts`, manual mocks via `Test.createTestingModule` + `getRepositoryToken`, matching `backend/src/landing-pages/landing-pages.service.spec.ts`).

---

## File Structure

**New backend files:**
- `backend/src/database/entities/funnel.entity.ts` — `Funnel` entity
- `backend/src/database/entities/funnel-enrollment.entity.ts` — `FunnelEnrollment` entity
- `backend/src/database/migrations/1786000000000-AddFunnels.ts` — creates `funnels`, `funnel_enrollments`
- `backend/src/database/migrations/1786100000000-AddLandingPageFunnelId.ts` — adds `landing_pages.funnelId`
- `backend/src/funnels/funnels.module.ts`
- `backend/src/funnels/funnels.service.ts` + `funnels.service.spec.ts`
- `backend/src/funnels/funnels.controller.ts`
- `backend/src/funnels/dto/create-funnel.dto.ts`, `update-funnel.dto.ts`

**Modified backend files:**
- `backend/src/integrations/whatsapp/whatsapp-followup-dispatch.service.ts` — optional `targetStepId` on the job payload
- `backend/src/integrations/whatsapp/whatsapp-followup.processor.ts` — pass `targetStepId` through
- `backend/src/integrations/whatsapp/whatsapp.service.ts` — `handleFollowupTimeout` target resolution, new `armFlowStepAt`/`startFlowForWorkspace` public methods, `sendFlowStep` email branch
- `backend/src/integrations/whatsapp/whatsapp.module.ts` — import `EmailModule`
- `backend/src/database/entities/landing-page.entity.ts` — add `funnelId?: string`
- `backend/src/landing-pages/landing-pages.service.ts` — enroll on submit
- `backend/src/landing-pages/landing-pages.module.ts` — import `FunnelsModule`
- `backend/src/app.module.ts` — register `FunnelsModule`

**New frontend files:**
- `frontend/types/funnel.ts`
- `frontend/app/(dashboard)/funnels/page.tsx` (list)
- `frontend/app/(dashboard)/funnels/[id]/page.tsx` (edit + enrollments)
- `frontend/app/(dashboard)/funnels/new/page.tsx`

**Modified frontend files:**
- `frontend/app/(dashboard)/whatsapp/page.tsx` — step editor: `email` step type fields, `anchorOffset` controls
- `frontend/app/(dashboard)/landing-pages/_components/LandingPageEditor.tsx` — funnel picker dropdown

---

### Task 1: `Funnel` + `FunnelEnrollment` entities and migration

**Files:**
- Create: `backend/src/database/entities/funnel.entity.ts`
- Create: `backend/src/database/entities/funnel-enrollment.entity.ts`
- Create: `backend/src/database/migrations/1786000000000-AddFunnels.ts`

**Interfaces:**
- Produces: `Funnel { id, workspaceId, name, status: FunnelStatus, integrationId, flowId, anchorDate? }`, `FunnelEnrollment { id, workspaceId, funnelId, contactId, waId, status: FunnelEnrollmentStatus, currentStepId?, attendedManual?, enrolledAt }`. Every later task imports these from these two files.

- [ ] **Step 1: Create the `Funnel` entity**

```ts
// backend/src/database/entities/funnel.entity.ts
import { Entity, Column, Index } from 'typeorm';
import { WorkspaceEntity } from './base.entity';

export enum FunnelStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  ARCHIVED = 'archived',
}

@Entity('funnels')
@Index('IDX_funnels_workspace_status', ['workspaceId', 'status'])
export class Funnel extends WorkspaceEntity {
  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'enum', enum: FunnelStatus, default: FunnelStatus.DRAFT })
  status: FunnelStatus;

  @Column({ type: 'uuid', comment: 'WhatsApp Integration this funnel\'s flow belongs to' })
  integrationId: string;

  @Column({ type: 'varchar', length: 100, comment: 'id of an entry in that integration\'s config.conversationFlows' })
  flowId: string;

  @Column({ type: 'timestamptz', nullable: true, comment: 'Anchor date for anchorOffset-timed steps, e.g. the webinar date/time' })
  anchorDate?: Date;
}
```

- [ ] **Step 2: Create the `FunnelEnrollment` entity**

```ts
// backend/src/database/entities/funnel-enrollment.entity.ts
import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { Funnel } from './funnel.entity';
import { Contact } from './contact.entity';

export enum FunnelEnrollmentStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  EXITED = 'exited',
}

@Entity('funnel_enrollments')
@Index('IDX_funnel_enrollments_workspace_funnel', ['workspaceId', 'funnelId'])
@Index('IDX_funnel_enrollments_contact', ['contactId'])
export class FunnelEnrollment extends WorkspaceEntity {
  @Column('uuid')
  funnelId: string;

  @ManyToOne(() => Funnel, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'funnelId' })
  funnel: Funnel;

  @Column('uuid')
  contactId: string;

  @ManyToOne(() => Contact, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'contactId' })
  contact: Contact;

  @Column({ type: 'varchar', length: 32, comment: 'WhatsApp waId driving the flow for this enrollment' })
  waId: string;

  @Column({ type: 'enum', enum: FunnelEnrollmentStatus, default: FunnelEnrollmentStatus.ACTIVE })
  status: FunnelEnrollmentStatus;

  @Column({ type: 'varchar', length: 100, nullable: true, comment: 'Current conversationFlows step id' })
  currentStepId?: string;

  @Column({ type: 'boolean', nullable: true, comment: 'Manually marked attended — the funnel branch signal' })
  attendedManual?: boolean;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  enrolledAt: Date;
}
```

- [ ] **Step 3: Write the migration**

```ts
// backend/src/database/migrations/1786000000000-AddFunnels.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFunnels1786000000000 implements MigrationInterface {
  name = 'AddFunnels1786000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."funnels_status_enum" AS ENUM('draft', 'active', 'archived');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."funnel_enrollments_status_enum" AS ENUM('active', 'completed', 'exited');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "funnels" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "workspaceId" uuid NOT NULL,
        "name" character varying(255) NOT NULL,
        "status" "public"."funnels_status_enum" NOT NULL DEFAULT 'draft',
        "integrationId" uuid NOT NULL,
        "flowId" character varying(100) NOT NULL,
        "anchorDate" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_funnels" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_funnels_workspace_status" ON "funnels" ("workspaceId", "status")
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "funnel_enrollments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "workspaceId" uuid NOT NULL,
        "funnelId" uuid NOT NULL,
        "contactId" uuid NOT NULL,
        "waId" character varying(32) NOT NULL,
        "status" "public"."funnel_enrollments_status_enum" NOT NULL DEFAULT 'active',
        "currentStepId" character varying(100),
        "attendedManual" boolean,
        "enrolledAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_funnel_enrollments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_funnel_enrollments_workspace_funnel" ON "funnel_enrollments" ("workspaceId", "funnelId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_funnel_enrollments_contact" ON "funnel_enrollments" ("contactId")
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "funnel_enrollments"
          ADD CONSTRAINT "FK_funnel_enrollments_funnel"
          FOREIGN KEY ("funnelId") REFERENCES "funnels"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "funnel_enrollments"
          ADD CONSTRAINT "FK_funnel_enrollments_contact"
          FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE CASCADE;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "funnel_enrollments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "funnels"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."funnel_enrollments_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."funnels_status_enum"`);
  }
}
```

- [ ] **Step 4: Run the migration locally to verify it applies cleanly**

Run: `cd backend && npm run migration:run`
Expected: `AddFunnels1786000000000` listed as executed, no errors. Then `npm run migration:revert` followed by `npm run migration:run` again to confirm `down()` is also correct.

- [ ] **Step 5: Commit**

```bash
git add backend/src/database/entities/funnel.entity.ts backend/src/database/entities/funnel-enrollment.entity.ts backend/src/database/migrations/1786000000000-AddFunnels.ts
git commit -m "feat(funnels): add Funnel and FunnelEnrollment entities"
```

---

### Task 2: Explicit-target follow-up job (dispatch service + processor)

**Files:**
- Modify: `backend/src/integrations/whatsapp/whatsapp-followup-dispatch.service.ts`
- Modify: `backend/src/integrations/whatsapp/whatsapp-followup.processor.ts`
- Test: `backend/src/integrations/whatsapp/whatsapp-followup-dispatch.service.spec.ts` (new)

**Interfaces:**
- Consumes: `QUEUE_NAMES.SCHEDULED_TASKS`, `JOB_TYPES.CHECK_FOLLOWUP_REPLY` from `backend/src/queues/queue.constants.ts` (unchanged).
- Produces: `WhatsAppFollowupDispatchService.schedule(flowId: string, waId: string, workspaceId: string, armedStepId: string, delayMs: number, targetStepId?: string): Promise<void>`. `FollowupCheckJobData` gains `targetStepId?: string`. Task 3 depends on this signature.

- [ ] **Step 1: Write the failing test for the new parameter**

```ts
// backend/src/integrations/whatsapp/whatsapp-followup-dispatch.service.spec.ts
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { WhatsAppFollowupDispatchService } from './whatsapp-followup-dispatch.service';
import { QUEUE_NAMES, JOB_TYPES } from '../../queues/queue.constants';

describe('WhatsAppFollowupDispatchService', () => {
  let service: WhatsAppFollowupDispatchService;
  let queue: any;

  beforeEach(async () => {
    queue = {
      add: jest.fn(),
      getJob: jest.fn().mockResolvedValue(null),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsAppFollowupDispatchService,
        { provide: getQueueToken(QUEUE_NAMES.SCHEDULED_TASKS), useValue: queue },
      ],
    }).compile();
    service = moduleRef.get(WhatsAppFollowupDispatchService);
  });

  it('includes targetStepId in the job payload when provided', async () => {
    await service.schedule('flow1', '407xxxxxxxx', 'ws1', 'step1', 5000, 'step2');
    expect(queue.add).toHaveBeenCalledWith(
      JOB_TYPES.CHECK_FOLLOWUP_REPLY,
      { workspaceId: 'ws1', waId: '407xxxxxxxx', flowId: 'flow1', armedStepId: 'step1', targetStepId: 'step2' },
      expect.objectContaining({ jobId: 'flow1:407xxxxxxxx', delay: 5000 }),
    );
  });

  it('omits targetStepId when not provided (existing timeoutBranch behavior)', async () => {
    await service.schedule('flow1', '407xxxxxxxx', 'ws1', 'step1', 5000);
    expect(queue.add).toHaveBeenCalledWith(
      JOB_TYPES.CHECK_FOLLOWUP_REPLY,
      { workspaceId: 'ws1', waId: '407xxxxxxxx', flowId: 'flow1', armedStepId: 'step1' },
      expect.objectContaining({ jobId: 'flow1:407xxxxxxxx', delay: 5000 }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest whatsapp-followup-dispatch.service.spec.ts`
Expected: FAIL — `schedule` doesn't accept a 6th argument / payload doesn't include `targetStepId`.

- [ ] **Step 3: Update the dispatch service**

```ts
// backend/src/integrations/whatsapp/whatsapp-followup-dispatch.service.ts
export interface FollowupCheckJobData {
  workspaceId: string;
  waId: string;
  flowId: string;
  armedStepId: string;
  targetStepId?: string;
}
```

Replace the `schedule` method body:

```ts
  async schedule(
    flowId: string,
    waId: string,
    workspaceId: string,
    armedStepId: string,
    delayMs: number,
    targetStepId?: string,
  ): Promise<void> {
    await this.cancel(flowId, waId);
    const data: FollowupCheckJobData = { workspaceId, waId, flowId, armedStepId };
    if (targetStepId) data.targetStepId = targetStepId;
    await this.queue.add(
      JOB_TYPES.CHECK_FOLLOWUP_REPLY,
      data,
      {
        jobId: this.jobId(flowId, waId),
        delay: Math.max(0, delayMs),
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: 50,
      },
    );
    this.logger.log(`Armed follow-up for ${waId} (flow ${flowId}, step ${armedStepId}${targetStepId ? ` → ${targetStepId}` : ''}) in ${Math.round(delayMs / 1000)}s`);
  }
```

- [ ] **Step 4: Update the processor to pass `targetStepId` through**

```ts
// backend/src/integrations/whatsapp/whatsapp-followup.processor.ts
  @Process(JOB_TYPES.CHECK_FOLLOWUP_REPLY)
  async handle(job: Job<FollowupCheckJobData>) {
    const { workspaceId, waId, flowId, armedStepId, targetStepId } = job.data;
    try {
      await this.whatsAppService.handleFollowupTimeout(workspaceId, waId, flowId, armedStepId, targetStepId);
    } catch (err: any) {
      this.logger.warn(`Follow-up check failed for ${waId} (flow ${flowId}, step ${armedStepId}): ${err?.message}`);
    }
  }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest whatsapp-followup-dispatch.service.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/integrations/whatsapp/whatsapp-followup-dispatch.service.ts backend/src/integrations/whatsapp/whatsapp-followup.processor.ts backend/src/integrations/whatsapp/whatsapp-followup-dispatch.service.spec.ts
git commit -m "feat(whatsapp): support an explicit target step in follow-up jobs"
```

---

### Task 3: `WhatsAppService` — `handleFollowupTimeout` target resolution + `armFlowStepAt` + `startFlowForWorkspace`

**Files:**
- Modify: `backend/src/integrations/whatsapp/whatsapp.service.ts`
- Test: `backend/src/integrations/whatsapp/whatsapp.service.spec.ts` (extend if it exists, else create — check with `find backend/src/integrations/whatsapp -name "whatsapp.service.spec.ts"` first; if absent, create a new minimal spec file scoped to just these methods, following the mocking style in `landing-pages.service.spec.ts`)

**Interfaces:**
- Consumes: `WhatsAppFollowupDispatchService.schedule(...)` from Task 2 (now accepts `targetStepId`).
- Produces:
  - `async startFlowForWorkspace(workspaceId: string, waId: string, flowId: string, variables?: Record<string, string>): Promise<boolean>`
  - `async armFlowStepAt(workspaceId: string, waId: string, flowId: string, armedStepId: string, targetStepId: string, delayMs: number): Promise<void>`
  - `async handleFollowupTimeout(workspaceId: string, waId: string, flowId: string, armedStepId: string, targetStepId?: string): Promise<void>` (signature gains the optional 5th param — existing callers unaffected)

Task 6 (`FunnelsService.enroll`) and Task 7 (`FunnelsService.setAttended`) call these three methods.

- [ ] **Step 1: Locate/create the spec file and write the failing tests**

First check whether a spec file already exists:

```bash
find backend/src/integrations/whatsapp -maxdepth 1 -name "whatsapp.service.spec.ts"
```

If it exists, add the tests below to it (matching its existing mock setup for `contactRepository`/`integrationRepository`/`followupDispatch`). If it doesn't exist, create it with this minimal scope:

```ts
// backend/src/integrations/whatsapp/whatsapp.service.spec.ts (new, or appended)
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { WhatsAppService } from './whatsapp.service';
import { Contact } from '../../database/entities/contact.entity';
import { Activity } from '../../database/entities/activity.entity';
import { Integration } from '../../database/entities/integration.entity';
import { User } from '../../database/entities/user.entity';
import { PipelineStage } from '../../database/entities/pipeline-stage.entity';
import { NotificationsService } from '../../notifications/notifications.service';
import { WhatsAppAIService } from './whatsapp-ai.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UploadService } from '../../upload/upload.service';
import { WhatsAppFollowupDispatchService } from './whatsapp-followup-dispatch.service';
import { WhatsAppCallingService } from './whatsapp-calling.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { EmailService } from '../../email/email.service';

describe('WhatsAppService flow arming', () => {
  let service: WhatsAppService;
  let integrationRepository: any;
  let followupDispatch: any;

  const baseIntegration = {
    id: 'int1',
    workspaceId: 'ws1',
    credentials: {},
    config: {
      conversationFlows: [
        {
          id: 'flow1',
          enabled: true,
          trigger: 'landing_page_submit',
          steps: [
            { id: 'step1', message: 'Thanks for registering!' },
            { id: 'step2', message: 'See you tomorrow!' },
          ],
        },
      ],
      flowStates: {},
    },
  };

  beforeEach(async () => {
    integrationRepository = {
      find: jest.fn().mockResolvedValue([baseIntegration]),
      save: jest.fn(async (x) => x),
    };
    followupDispatch = { schedule: jest.fn(), cancel: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        { provide: getRepositoryToken(Contact), useValue: { findOne: jest.fn(), createQueryBuilder: jest.fn() } },
        { provide: getRepositoryToken(Activity), useValue: { create: jest.fn(), save: jest.fn() } },
        { provide: getRepositoryToken(Integration), useValue: integrationRepository },
        { provide: getRepositoryToken(User), useValue: { findOne: jest.fn() } },
        { provide: getRepositoryToken(PipelineStage), useValue: { findOne: jest.fn() } },
        { provide: NotificationsService, useValue: {} },
        { provide: WhatsAppAIService, useValue: {} },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: UploadService, useValue: {} },
        { provide: WhatsAppFollowupDispatchService, useValue: followupDispatch },
        { provide: WhatsAppCallingService, useValue: {} },
        { provide: HttpService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: EmailService, useValue: { sendMail: jest.fn() } },
      ],
    }).compile();

    service = moduleRef.get(WhatsAppService);
    jest.spyOn<any, any>(service, 'sendMessageWithCredentials').mockResolvedValue({ messages: [{ id: 'wamid1' }] });
    jest.spyOn<any, any>(service, 'sendTextMessage').mockResolvedValue(undefined);
    jest.spyOn<any, any>(service, 'saveOutboundActivity').mockResolvedValue(undefined);
  });

  it('startFlowForWorkspace arms the named flow directly, no auto-send rule needed', async () => {
    const started = await service.startFlowForWorkspace('ws1', '40700000000', 'flow1');
    expect(started).toBe(true);
    expect(integrationRepository.save).toHaveBeenCalled();
    const saved = integrationRepository.save.mock.calls[0][0];
    expect(saved.config.flowStates['40700000000'].currentStepId).toBe('step1');
  });

  it('armFlowStepAt schedules a durable job with an explicit target step', async () => {
    await service.armFlowStepAt('ws1', '40700000000', 'flow1', 'step1', 'step2', 60000);
    expect(followupDispatch.schedule).toHaveBeenCalledWith('flow1', '40700000000', 'ws1', 'step1', 60000, 'step2');
  });

  it('handleFollowupTimeout sends the explicit targetStepId, not the step\'s own timeoutBranch', async () => {
    integrationRepository.find.mockResolvedValueOnce([{
      ...baseIntegration,
      config: {
        ...baseIntegration.config,
        flowStates: { '40700000000': { flowId: 'flow1', currentStepId: 'step1' } },
      },
    }]);
    await service.handleFollowupTimeout('ws1', '40700000000', 'flow1', 'step1', 'step2');
    expect((service as any).sendTextMessage).toHaveBeenCalledWith('40700000000', 'See you tomorrow!', {});
  });

  it('handleFollowupTimeout no-ops if the contact already moved past the armed step', async () => {
    integrationRepository.find.mockResolvedValueOnce([{
      ...baseIntegration,
      config: {
        ...baseIntegration.config,
        flowStates: { '40700000000': { flowId: 'flow1', currentStepId: 'step2' } },
      },
    }]);
    await service.handleFollowupTimeout('ws1', '40700000000', 'flow1', 'step1', 'step2');
    expect((service as any).sendTextMessage).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx jest whatsapp.service.spec.ts -t "flow arming"`
Expected: FAIL — `startFlowForWorkspace`/`armFlowStepAt` don't exist yet; `handleFollowupTimeout` doesn't accept a 5th arg.

- [ ] **Step 3: Add `startFlowForWorkspace` and `armFlowStepAt`**

Add these two public methods to `whatsapp.service.ts`, near the existing `startFlow` method (~line 4013):

```ts
  /**
   * Public entry point to arm a flow directly by id, for callers (e.g. the
   * Funnels module) with no inbound WhatsApp message to match against —
   * unlike armAfterAutoSendFlow, this doesn't require a prior auto-send rule.
   */
  async startFlowForWorkspace(
    workspaceId: string,
    waId: string,
    flowId: string,
    variables?: Record<string, string>,
  ): Promise<boolean> {
    const integration = await this.findIntegrationForWorkspace(workspaceId);
    if (!integration) return false;
    return this.startFlow(workspaceId, waId, flowId, integration, variables);
  }

  /**
   * Durably arms a follow-up job that fires `targetStepId` after `delayMs`,
   * as long as the contact is still sitting at `armedStepId` when it fires.
   * Used for funnel steps whose timing is computed from a Funnel's
   * anchorDate (delayMs > 0) or for an immediate manual branch dispatch
   * (delayMs 0) — e.g. a "mark attended" toggle routing to the next step.
   */
  async armFlowStepAt(
    workspaceId: string,
    waId: string,
    flowId: string,
    armedStepId: string,
    targetStepId: string,
    delayMs: number,
  ): Promise<void> {
    await this.followupDispatch.schedule(flowId, waId, workspaceId, armedStepId, Math.max(0, delayMs), targetStepId);
  }
```

- [ ] **Step 4: Update `handleFollowupTimeout` to resolve the explicit target when given**

Find the existing method (~line 4155) and change its signature and the `nextStep` lookup line:

```ts
  async handleFollowupTimeout(workspaceId: string, waId: string, flowId: string, armedStepId: string, targetStepId?: string): Promise<void> {
    const integration = await this.findIntegrationForWorkspace(workspaceId);
    if (!integration) return;

    const flowStates = integration.config?.flowStates || {};
    const resolved = this.resolveFlowState(flowStates, waId);
    if (!resolved) return; // flow already ended
    const { stateKey, state } = resolved;
    if (state.flowId !== flowId || state.currentStepId !== armedStepId) return; // stale — contact moved on

    const flows: any[] = integration.config?.conversationFlows || [];
    const flow = flows.find((f: any) => f.id === flowId && f.enabled);
    const armedStep = flow?.steps?.find((s: any) => s.id === armedStepId);
    const resolvedTargetId = targetStepId || armedStep?.timeoutBranch?.nextStepId;
    const nextStep = flow?.steps?.find((s: any) => s.id === resolvedTargetId);
    // ... rest of the method is unchanged from here (delete stale state if !flow || !nextStep, else send + advance + chain)
```

Everything after that line (the send/advance/chain block) stays exactly as it is today — only the `nextStep` lookup line changes.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && npx jest whatsapp.service.spec.ts -t "flow arming"`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/integrations/whatsapp/whatsapp.service.ts backend/src/integrations/whatsapp/whatsapp.service.spec.ts
git commit -m "feat(whatsapp): add startFlowForWorkspace and armFlowStepAt for external callers"
```

---

### Task 4: `WhatsAppService` — `email` step type in `sendFlowStep`

**Files:**
- Modify: `backend/src/integrations/whatsapp/whatsapp.service.ts`
- Modify: `backend/src/integrations/whatsapp/whatsapp.module.ts`
- Test: `backend/src/integrations/whatsapp/whatsapp.service.spec.ts` (same file as Task 3)

**Interfaces:**
- Consumes: `EmailService.sendMail` — check the exact exported method name in `backend/src/email/email.service.ts` before writing this task's code (the constructor snippet read during planning showed the transporter setup but not the public send method name/signature — confirm with `grep -n "async send" backend/src/email/email.service.ts` and use whatever it actually is; assume `send(options: EmailOptions): Promise<void>` based on the `EmailOptions` interface already shown unless the grep says otherwise).
- Produces: `sendFlowStep` step param type gains `type?: 'template' | 'interactive' | 'email'`, `emailSubject?: string`.

- [ ] **Step 1: Confirm the EmailService send method**

Run: `grep -n "async send" backend/src/email/email.service.ts`
Use the exact method name/signature found. (If it differs from `send(options: EmailOptions)`, adjust Steps 3-4 below to match — don't guess further.)

- [ ] **Step 2: Write the failing test**

Add to the same `whatsapp.service.spec.ts` describe block from Task 3 (needs a contact with an email — extend the `Contact` repository mock):

```ts
  it('sendFlowStep with type "email" sends via EmailService using the contact\'s email, not WhatsApp', async () => {
    const emailService = moduleRef.get(EmailService); // grab from the same moduleRef built in beforeEach — restructure beforeEach to expose `moduleRef` if not already
    const contactRepo = moduleRef.get(getRepositoryToken(Contact));
    contactRepo.findOne = jest.fn().mockResolvedValue({ id: 'c1', email: 'lead@example.com', phone: '+40700000000' });

    integrationRepository.find.mockResolvedValueOnce([{
      ...baseIntegration,
      config: {
        conversationFlows: [{
          id: 'flow1', enabled: true, trigger: 'landing_page_submit',
          steps: [{ id: 'step1', type: 'email', emailSubject: 'Reminder', message: 'See you at 6pm!' }],
        }],
        flowStates: {},
      },
    }]);

    await service.startFlowForWorkspace('ws1', '40700000000', 'flow1');
    expect(emailService.send).toHaveBeenCalledWith(expect.objectContaining({
      to: 'lead@example.com',
      subject: 'Reminder',
      text: 'See you at 6pm!',
    }));
    expect((service as any).sendTextMessage).not.toHaveBeenCalled();
  });
```

(Restructure the `beforeEach` in Task 3 to keep a reference to `moduleRef` outside the function scope, e.g. `let moduleRef: TestingModule;` assigned inside `beforeEach`, so this test and Task 3's tests can both call `moduleRef.get(...)`.)

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest whatsapp.service.spec.ts -t "sendFlowStep with type"`
Expected: FAIL — `email` branch doesn't exist; `EmailService` not injected.

- [ ] **Step 4: Inject `EmailService` and add the email branch to `sendFlowStep`**

In `whatsapp.module.ts`, add the import:

```ts
import { EmailModule } from '../../email/email.module';
// ...
@Module({
  imports: [
    HttpModule,
    ConfigModule,
    TypeOrmModule.forFeature([Contact, Activity, Integration, User, PipelineStage, WhatsAppCampaign]),
    NotificationsModule,
    CampaignDispatchModule,
    UploadModule,
    WhatsAppFollowupDispatchModule,
    EmailModule,
  ],
  ...
```

In `whatsapp.service.ts`, add `EmailService` to the constructor:

```ts
    private readonly followupDispatch: WhatsAppFollowupDispatchService,
    private readonly callingService: WhatsAppCallingService,
    private readonly emailService: EmailService,
  ) {}
```

(add the import `import { EmailService } from '../../email/email.service';` at the top)

In `sendFlowStep`, add `type?: 'template' | 'interactive' | 'email'` and `emailSubject?: string` to the step param type, and insert this branch as the very first check in the method body (before the existing `if (step.type === 'template' ...)`):

```ts
    if (step.type === 'email') {
      const contact = await this.contactRepository.findOne({ where: { phone: waId, workspaceId } });
      const email = contact?.email;
      if (!email || email.endsWith('@whatsapp.placeholder.invalid')) {
        this.logger.warn(`Flow step "${step.id}": no real email on file for ${waId}, skipping email step`);
        return;
      }
      const subject = resolveVars(step.emailSubject || '');
      const text = resolveVars(stepMessage);
      await this.emailService.send({ to: email, subject, text });
      await this.saveOutboundActivity(waId, `[Flow email: ${subject}] ${text}`, 'email', workspaceId, '', undefined);
      this.logger.log(`Flow step "${step.id}" (email) sent to ${email}`);
      return;
    }
```

Note: `resolveVars` is defined earlier in the same method body (the `{{tokenName}}` substitution closure) — this branch must be placed after that closure is defined, same as the existing branches.

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest whatsapp.service.spec.ts`
Expected: PASS (all tests in the file, including Task 3's)

- [ ] **Step 6: Commit**

```bash
git add backend/src/integrations/whatsapp/whatsapp.service.ts backend/src/integrations/whatsapp/whatsapp.module.ts backend/src/integrations/whatsapp/whatsapp.service.spec.ts
git commit -m "feat(whatsapp): add email step type to conversation flows"
```

---

### Task 5: `FunnelsModule` + `FunnelsService` CRUD

**Files:**
- Create: `backend/src/funnels/funnels.module.ts`
- Create: `backend/src/funnels/funnels.service.ts`
- Create: `backend/src/funnels/funnels.service.spec.ts`
- Create: `backend/src/funnels/dto/create-funnel.dto.ts`
- Create: `backend/src/funnels/dto/update-funnel.dto.ts`
- Modify: `backend/src/app.module.ts`

**Interfaces:**
- Consumes: `Funnel`, `FunnelStatus` from Task 1.
- Produces: `FunnelsService.create(workspaceId, dto): Promise<Funnel>`, `.update(workspaceId, id, dto): Promise<Funnel>`, `.findAll(workspaceId): Promise<Funnel[]>`, `.findOne(workspaceId, id): Promise<Funnel>`, `.remove(workspaceId, id): Promise<void>`. Task 6/7 add `.enroll`/`.setAttended` to this same service.

- [ ] **Step 1: DTOs**

```ts
// backend/src/funnels/dto/create-funnel.dto.ts
import { IsString, IsOptional, IsEnum, IsUUID, IsDateString, MaxLength } from 'class-validator';
import { FunnelStatus } from '../../database/entities/funnel.entity';

export class CreateFunnelDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsEnum(FunnelStatus)
  status?: FunnelStatus;

  @IsUUID()
  integrationId: string;

  @IsString()
  flowId: string;

  @IsOptional()
  @IsDateString()
  anchorDate?: string;
}
```

```ts
// backend/src/funnels/dto/update-funnel.dto.ts
import { PartialType } from '@nestjs/mapped-types';
import { CreateFunnelDto } from './create-funnel.dto';

export class UpdateFunnelDto extends PartialType(CreateFunnelDto) {}
```

- [ ] **Step 2: Write the failing test for CRUD**

```ts
// backend/src/funnels/funnels.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { FunnelsService } from './funnels.service';
import { Funnel, FunnelStatus } from '../database/entities/funnel.entity';
import { FunnelEnrollment } from '../database/entities/funnel-enrollment.entity';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';

describe('FunnelsService CRUD', () => {
  let service: FunnelsService;
  let funnelRepo: any;

  beforeEach(async () => {
    funnelRepo = {
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'f1', ...x })),
      find: jest.fn(async () => []),
      findOne: jest.fn(),
      remove: jest.fn(async () => undefined),
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        FunnelsService,
        { provide: getRepositoryToken(Funnel), useValue: funnelRepo },
        { provide: getRepositoryToken(FunnelEnrollment), useValue: { create: jest.fn(), save: jest.fn(), find: jest.fn() } },
        { provide: WhatsAppService, useValue: { getFlows: jest.fn(), startFlowForWorkspace: jest.fn(), armFlowStepAt: jest.fn() } },
      ],
    }).compile();
    service = moduleRef.get(FunnelsService);
  });

  it('creates a funnel scoped to the workspace', async () => {
    const created = await service.create('ws1', { name: 'Webinar Aug', integrationId: 'int1', flowId: 'flow1' } as any);
    expect(funnelRepo.create).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'ws1', name: 'Webinar Aug' }));
    expect(created.id).toBe('f1');
  });

  it('throws NotFoundException finding a funnel in another workspace', async () => {
    funnelRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.findOne('ws1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest funnels.service.spec.ts`
Expected: FAIL — `FunnelsService` doesn't exist.

- [ ] **Step 4: Implement `FunnelsService` CRUD**

```ts
// backend/src/funnels/funnels.service.ts
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Funnel } from '../database/entities/funnel.entity';
import { FunnelEnrollment } from '../database/entities/funnel-enrollment.entity';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';
import { CreateFunnelDto } from './dto/create-funnel.dto';
import { UpdateFunnelDto } from './dto/update-funnel.dto';

@Injectable()
export class FunnelsService {
  private readonly logger = new Logger(FunnelsService.name);

  constructor(
    @InjectRepository(Funnel)
    private readonly funnelRepository: Repository<Funnel>,
    @InjectRepository(FunnelEnrollment)
    private readonly enrollmentRepository: Repository<FunnelEnrollment>,
    private readonly whatsappService: WhatsAppService,
  ) {}

  async create(workspaceId: string, dto: CreateFunnelDto): Promise<Funnel> {
    const funnel = this.funnelRepository.create({
      ...dto,
      workspaceId,
      anchorDate: dto.anchorDate ? new Date(dto.anchorDate) : undefined,
    });
    return this.funnelRepository.save(funnel);
  }

  async findAll(workspaceId: string): Promise<Funnel[]> {
    return this.funnelRepository.find({ where: { workspaceId }, order: { createdAt: 'DESC' } });
  }

  async findOne(workspaceId: string, id: string): Promise<Funnel> {
    const funnel = await this.funnelRepository.findOne({ where: { id, workspaceId } });
    if (!funnel) throw new NotFoundException('Funnel not found');
    return funnel;
  }

  async update(workspaceId: string, id: string, dto: UpdateFunnelDto): Promise<Funnel> {
    const funnel = await this.findOne(workspaceId, id);
    Object.assign(funnel, {
      ...dto,
      anchorDate: dto.anchorDate ? new Date(dto.anchorDate) : funnel.anchorDate,
    });
    return this.funnelRepository.save(funnel);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const funnel = await this.findOne(workspaceId, id);
    await this.funnelRepository.remove(funnel);
  }
}
```

- [ ] **Step 5: Module + app registration**

```ts
// backend/src/funnels/funnels.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FunnelsService } from './funnels.service';
import { FunnelsController } from './funnels.controller';
import { Funnel } from '../database/entities/funnel.entity';
import { FunnelEnrollment } from '../database/entities/funnel-enrollment.entity';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Funnel, FunnelEnrollment]),
    WhatsAppModule,
  ],
  controllers: [FunnelsController],
  providers: [FunnelsService],
  exports: [FunnelsService],
})
export class FunnelsModule {}
```

In `backend/src/app.module.ts`, add `import { FunnelsModule } from './funnels/funnels.module';` near the other feature module imports, and add `FunnelsModule` to the `imports` array near `LandingPagesModule`. (`FunnelsController` doesn't exist until Task 8 — for this task, temporarily comment out `controllers: [FunnelsController]` and the import, or do Task 5 and Task 8 as one combined commit if running inline rather than via subagents. If executing task-by-task with review gates, leave `funnels.controller.ts` as an empty placeholder controller with no routes, `@Controller('funnels') export class FunnelsController {}`, to keep the module wiring valid — Task 8 fills it in.)

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && npx jest funnels.service.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/src/funnels backend/src/app.module.ts
git commit -m "feat(funnels): add FunnelsModule with CRUD service"
```

---

### Task 6: `FunnelsService.enroll()`

**Files:**
- Modify: `backend/src/funnels/funnels.service.ts`
- Modify: `backend/src/funnels/funnels.service.spec.ts`

**Interfaces:**
- Consumes: `WhatsAppService.getFlows(workspaceId): Promise<any[]>` (existing, public — returns `integration.config.conversationFlows`), `.startFlowForWorkspace` and `.armFlowStepAt` from Task 3.
- Produces: `FunnelsService.enroll(contact: Contact, funnelId: string): Promise<FunnelEnrollment | null>`. Task 9 (`LandingPagesService.submitPublic`) calls this.

- [ ] **Step 1: Write the failing test**

```ts
  it('enroll() starts the flow instantly and arms the anchor-relative step from the flow\'s second step', async () => {
    funnelRepo.findOne.mockResolvedValueOnce({
      id: 'f1', workspaceId: 'ws1', status: FunnelStatus.ACTIVE, flowId: 'flow1',
      anchorDate: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000), // 2 days from now
    });
    const whatsapp = moduleRef.get(WhatsAppService);
    whatsapp.getFlows.mockResolvedValue([{
      id: 'flow1', enabled: true,
      steps: [
        { id: 'step1', message: 'Thanks for registering!' },
        { id: 'step2', message: 'Reminder!', anchorOffset: { relation: 'before', minutes: 24 * 60 } },
      ],
    }]);
    whatsapp.startFlowForWorkspace.mockResolvedValue(true);
    const enrollmentRepo = moduleRef.get(getRepositoryToken(FunnelEnrollment));
    enrollmentRepo.create = jest.fn((x: any) => x);
    enrollmentRepo.save = jest.fn(async (x: any) => ({ id: 'e1', ...x }));

    const contact = { id: 'c1', workspaceId: 'ws1', phone: '+40700000000' } as any;
    const enrollment = await service.enroll(contact, 'f1');

    expect(whatsapp.startFlowForWorkspace).toHaveBeenCalledWith('ws1', '+40700000000', 'flow1');
    expect(whatsapp.armFlowStepAt).toHaveBeenCalledWith(
      'ws1', '+40700000000', 'flow1', 'step1', 'step2', expect.any(Number),
    );
    const armedDelay = whatsapp.armFlowStepAt.mock.calls[0][5];
    expect(armedDelay).toBeGreaterThan(0);
    expect(armedDelay).toBeLessThanOrEqual(2 * 24 * 60 * 60 * 1000);
    expect(enrollment?.id).toBe('e1');
  });

  it('enroll() returns null and does not start a flow if the contact has no phone', async () => {
    funnelRepo.findOne.mockResolvedValueOnce({ id: 'f1', workspaceId: 'ws1', status: FunnelStatus.ACTIVE, flowId: 'flow1' });
    const whatsapp = moduleRef.get(WhatsAppService);
    const contact = { id: 'c1', workspaceId: 'ws1', phone: undefined } as any;
    const enrollment = await service.enroll(contact, 'f1');
    expect(enrollment).toBeNull();
    expect(whatsapp.startFlowForWorkspace).not.toHaveBeenCalled();
  });
```

(Same `beforeEach`/`moduleRef` restructuring note as Task 4 applies here — keep `moduleRef` in outer scope.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest funnels.service.spec.ts -t "enroll"`
Expected: FAIL — `enroll` doesn't exist.

- [ ] **Step 3: Implement `enroll`**

```ts
  async enroll(contact: { id: string; workspaceId: string; phone?: string }, funnelId: string): Promise<FunnelEnrollment | null> {
    const funnel = await this.funnelRepository.findOne({ where: { id: funnelId, workspaceId: contact.workspaceId } });
    if (!funnel || funnel.status !== FunnelStatus.ACTIVE) {
      this.logger.warn(`enroll(): funnel ${funnelId} not found or not active for workspace ${contact.workspaceId}`);
      return null;
    }
    if (!contact.phone) {
      this.logger.warn(`enroll(): contact ${contact.id} has no phone, cannot start WhatsApp flow`);
      return null;
    }

    const flows = await this.whatsappService.getFlows(contact.workspaceId);
    const flow = flows.find((f: any) => f.id === funnel.flowId && f.enabled);
    if (!flow || !flow.steps?.length) {
      this.logger.warn(`enroll(): flow ${funnel.flowId} not found/enabled/empty for workspace ${contact.workspaceId}`);
      return null;
    }

    const waId = contact.phone;
    const enrollment = this.enrollmentRepository.create({
      workspaceId: contact.workspaceId,
      funnelId: funnel.id,
      contactId: contact.id,
      waId,
      currentStepId: flow.steps[0].id,
    });
    const saved = await this.enrollmentRepository.save(enrollment);

    await this.whatsappService.startFlowForWorkspace(contact.workspaceId, waId, flow.id);

    const anchorStep = flow.steps.find((s: any) => s.anchorOffset);
    if (anchorStep && funnel.anchorDate) {
      const offsetMs = anchorStep.anchorOffset.minutes * 60000 * (anchorStep.anchorOffset.relation === 'before' ? -1 : 1);
      const fireAt = new Date(funnel.anchorDate).getTime() + offsetMs;
      const delayMs = Math.max(0, fireAt - Date.now());
      await this.whatsappService.armFlowStepAt(contact.workspaceId, waId, flow.id, flow.steps[0].id, anchorStep.id, delayMs);
    }

    return saved;
  }
```

Import `FunnelStatus` from `'../database/entities/funnel.entity'` if not already imported.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest funnels.service.spec.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/funnels/funnels.service.ts backend/src/funnels/funnels.service.spec.ts
git commit -m "feat(funnels): enroll a contact — instant confirmation + anchor-dated reminder"
```

---

### Task 7: `FunnelsService.setAttended()`

**Files:**
- Modify: `backend/src/funnels/funnels.service.ts`
- Modify: `backend/src/funnels/funnels.service.spec.ts`

**Interfaces:**
- Consumes: `WhatsAppService.getFlows`, `.armFlowStepAt` from Tasks 3/6.
- Produces: `FunnelsService.setAttended(workspaceId: string, enrollmentId: string, attended: boolean): Promise<FunnelEnrollment>`. Task 8's controller endpoint calls this.

Branching rule: the step the contact is currently on (set via Task 6's anchor-relative arm) is expected to carry both a `timeoutBranch` (its own no-show fallback, authored in the flow editor same as any other step — no new code needed for that) and, separately, this method looks up `attendedNextStepId` — a plain string field on that step (added to the step schema alongside `anchorOffset`, no new mechanism) pointing to the "thanks, here's the recording" step. If `attended` is `true`, dispatch to it immediately (delay 0); if `false`, do nothing beyond recording the flag (the existing `timeoutBranch` grace-period fallback already handles routing no-shows once it fires).

- [ ] **Step 1: Write the failing test**

```ts
  it('setAttended(true) records the flag and immediately routes to the step\'s attendedNextStepId', async () => {
    enrollmentRepoMock.findOne = jest.fn().mockResolvedValue({
      id: 'e1', workspaceId: 'ws1', funnelId: 'f1', waId: '+40700000000', currentStepId: 'step2',
    });
    enrollmentRepoMock.save = jest.fn(async (x: any) => x);
    funnelRepo.findOne.mockResolvedValueOnce({ id: 'f1', workspaceId: 'ws1', flowId: 'flow1' });
    const whatsapp = moduleRef.get(WhatsAppService);
    whatsapp.getFlows.mockResolvedValue([{
      id: 'flow1', enabled: true,
      steps: [
        { id: 'step1' },
        { id: 'step2', attendedNextStepId: 'step3-thanks', timeoutBranch: { delayValue: 4, delayUnit: 'hours', nextStepId: 'step3-noshow' } },
        { id: 'step3-thanks', message: 'Thanks for coming!' },
      ],
    }]);

    const updated = await service.setAttended('ws1', 'e1', true);

    expect(updated.attendedManual).toBe(true);
    expect(whatsapp.armFlowStepAt).toHaveBeenCalledWith('ws1', '+40700000000', 'flow1', 'step2', 'step3-thanks', 0);
  });

  it('setAttended(false) just records the flag, leaving the existing no-show timeoutBranch to fire on its own', async () => {
    enrollmentRepoMock.findOne = jest.fn().mockResolvedValue({
      id: 'e1', workspaceId: 'ws1', funnelId: 'f1', waId: '+40700000000', currentStepId: 'step2',
    });
    enrollmentRepoMock.save = jest.fn(async (x: any) => x);
    funnelRepo.findOne.mockResolvedValueOnce({ id: 'f1', workspaceId: 'ws1', flowId: 'flow1' });
    const whatsapp = moduleRef.get(WhatsAppService);
    whatsapp.getFlows.mockResolvedValue([{ id: 'flow1', enabled: true, steps: [{ id: 'step2', attendedNextStepId: 'step3-thanks' }] }]);

    const updated = await service.setAttended('ws1', 'e1', false);

    expect(updated.attendedManual).toBe(false);
    expect(whatsapp.armFlowStepAt).not.toHaveBeenCalled();
  });
```

Set up `enrollmentRepoMock` as a named variable in `beforeEach` (replacing the inline object literal used in Task 5/6's provider registration) so these tests can configure `findOne`/`save` on it directly.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest funnels.service.spec.ts -t "setAttended"`
Expected: FAIL — `setAttended` doesn't exist.

- [ ] **Step 3: Implement `setAttended`**

```ts
  async setAttended(workspaceId: string, enrollmentId: string, attended: boolean): Promise<FunnelEnrollment> {
    const enrollment = await this.enrollmentRepository.findOne({ where: { id: enrollmentId, workspaceId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    enrollment.attendedManual = attended;
    const saved = await this.enrollmentRepository.save(enrollment);

    if (attended && enrollment.currentStepId) {
      const funnel = await this.funnelRepository.findOne({ where: { id: enrollment.funnelId, workspaceId } });
      if (funnel) {
        const flows = await this.whatsappService.getFlows(workspaceId);
        const flow = flows.find((f: any) => f.id === funnel.flowId && f.enabled);
        const currentStep = flow?.steps?.find((s: any) => s.id === enrollment.currentStepId);
        if (currentStep?.attendedNextStepId) {
          await this.whatsappService.armFlowStepAt(
            workspaceId, enrollment.waId, funnel.flowId, enrollment.currentStepId, currentStep.attendedNextStepId, 0,
          );
        }
      }
    }

    return saved;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest funnels.service.spec.ts`
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/funnels/funnels.service.ts backend/src/funnels/funnels.service.spec.ts
git commit -m "feat(funnels): manual mark-attended branch dispatch"
```

---

### Task 8: `FunnelsController` + DTOs wiring

**Files:**
- Create/replace: `backend/src/funnels/funnels.controller.ts` (replacing Task 5's placeholder)

**Interfaces:**
- Consumes: `FunnelsService` (Tasks 5-7).
- Produces: REST endpoints under `/funnels`.

- [ ] **Step 1: Implement the controller**

```ts
// backend/src/funnels/funnels.controller.ts
import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { FunnelsService } from './funnels.service';
import { CreateFunnelDto } from './dto/create-funnel.dto';
import { UpdateFunnelDto } from './dto/update-funnel.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('funnels')
@UseGuards(JwtAuthGuard)
export class FunnelsController {
  constructor(private readonly funnelsService: FunnelsService) {}

  @Post()
  create(@Req() req, @Body() dto: CreateFunnelDto) {
    return this.funnelsService.create(req.user.workspaceId, dto);
  }

  @Get()
  findAll(@Req() req) {
    return this.funnelsService.findAll(req.user.workspaceId);
  }

  @Get(':id')
  findOne(@Req() req, @Param('id') id: string) {
    return this.funnelsService.findOne(req.user.workspaceId, id);
  }

  @Patch(':id')
  update(@Req() req, @Param('id') id: string, @Body() dto: UpdateFunnelDto) {
    return this.funnelsService.update(req.user.workspaceId, id, dto);
  }

  @Delete(':id')
  remove(@Req() req, @Param('id') id: string) {
    return this.funnelsService.remove(req.user.workspaceId, id);
  }

  @Get(':id/enrollments')
  listEnrollments(@Req() req, @Param('id') id: string) {
    return this.funnelsService.listEnrollments(req.user.workspaceId, id);
  }

  @Patch('enrollments/:enrollmentId/attended')
  setAttended(@Req() req, @Param('enrollmentId') enrollmentId: string, @Body('attended') attended: boolean) {
    return this.funnelsService.setAttended(req.user.workspaceId, enrollmentId, !!attended);
  }
}
```

This references `FunnelsService.listEnrollments`, which doesn't exist yet — add it:

```ts
  // in funnels.service.ts
  async listEnrollments(workspaceId: string, funnelId: string): Promise<FunnelEnrollment[]> {
    return this.enrollmentRepository.find({ where: { workspaceId, funnelId }, order: { enrolledAt: 'DESC' } });
  }
```

- [ ] **Step 2: Write a test for `listEnrollments`**

```ts
  it('listEnrollments scopes to workspace and funnel', async () => {
    const enrollmentRepo = moduleRef.get(getRepositoryToken(FunnelEnrollment));
    enrollmentRepo.find = jest.fn().mockResolvedValue([{ id: 'e1' }]);
    const result = await service.listEnrollments('ws1', 'f1');
    expect(enrollmentRepo.find).toHaveBeenCalledWith({ where: { workspaceId: 'ws1', funnelId: 'f1' }, order: { enrolledAt: 'DESC' } });
    expect(result).toEqual([{ id: 'e1' }]);
  });
```

- [ ] **Step 3: Run test to verify it passes**

Run: `cd backend && npx jest funnels.service.spec.ts`
Expected: PASS (all tests)

- [ ] **Step 4: Confirm the backend compiles and the module wires up cleanly**

Run: `cd backend && npm run typecheck`
Expected: no errors, `FunnelsController` and `FunnelsService` resolve correctly in `app.module.ts` (Nest's DI would fail fast at boot otherwise — a `npm run start:dev` smoke check is also reasonable here if time allows).

- [ ] **Step 5: Commit**

```bash
git add backend/src/funnels/funnels.controller.ts backend/src/funnels/funnels.service.ts backend/src/funnels/funnels.service.spec.ts
git commit -m "feat(funnels): REST endpoints for funnel CRUD, enrollments, and attended toggle"
```

---

### Task 9: Landing page → funnel link + auto-enroll on submit

**Files:**
- Modify: `backend/src/database/entities/landing-page.entity.ts`
- Create: `backend/src/database/migrations/1786100000000-AddLandingPageFunnelId.ts`
- Modify: `backend/src/landing-pages/landing-pages.service.ts`
- Modify: `backend/src/landing-pages/landing-pages.module.ts`
- Modify: `backend/src/landing-pages/landing-pages.service.spec.ts`
- Modify: `backend/src/funnels/dto/create-funnel.dto.ts`'s sibling `CreateLandingPageDto`/`UpdateLandingPageDto` if `funnelId` needs to be settable via the existing landing page create/update endpoints (it does — add `@IsOptional() @IsUUID() funnelId?: string` to both).

**Interfaces:**
- Consumes: `FunnelsService.enroll` from Task 6.
- Produces: `LandingPage.funnelId?: string`.

- [ ] **Step 1: Entity + migration**

```ts
// backend/src/database/entities/landing-page.entity.ts — add alongside the existing formId column
  @Column({ type: 'uuid', nullable: true, comment: 'Funnel to auto-enroll new contacts into on submit' })
  funnelId?: string;
```

```ts
// backend/src/database/migrations/1786100000000-AddLandingPageFunnelId.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLandingPageFunnelId1786100000000 implements MigrationInterface {
  name = 'AddLandingPageFunnelId1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "funnelId" uuid
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "landing_pages"
          ADD CONSTRAINT "FK_landing_pages_funnel"
          FOREIGN KEY ("funnelId") REFERENCES "funnels"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "landing_pages" DROP CONSTRAINT IF EXISTS "FK_landing_pages_funnel"`);
    await queryRunner.query(`ALTER TABLE "landing_pages" DROP COLUMN IF EXISTS "funnelId"`);
  }
}
```

- [ ] **Step 2: Run migration to verify**

Run: `cd backend && npm run migration:run`
Expected: `AddLandingPageFunnelId1786100000000` applied cleanly (depends on Task 1's `funnels` table already existing).

- [ ] **Step 3: Write the failing test for the submit-time enroll hook**

Add to `landing-pages.service.spec.ts` (mirroring its existing `beforeEach` mock style — add a `funnelsService` mock to the providers array: `{ provide: FunnelsService, useValue: { enroll: jest.fn() } }`, plus import `FunnelsService` from `'../funnels/funnels.service'`):

```ts
  it('submitPublic enrolls the new contact into the linked funnel when the page has one', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: 'lp1', workspaceId: 'ws1', formId: 'form1', funnelId: 'funnel1',
      captureType: LandingPageCaptureType.NATIVE, submissionCount: 0,
    });
    formsService.findFormById.mockResolvedValueOnce({ id: 'form1', fields: [] });
    const contact = { id: 'c1', workspaceId: 'ws1', phone: '+40700000000' };
    formsService.createSubmissionForForm.mockResolvedValueOnce({ submission: { data: {} }, contact });

    await service.submitPublic('promo', { data: {} } as any, {});

    expect(funnelsService.enroll).toHaveBeenCalledWith(contact, 'funnel1');
  });

  it('submitPublic does not call enroll when the page has no funnelId', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: 'lp1', workspaceId: 'ws1', formId: 'form1', funnelId: undefined,
      captureType: LandingPageCaptureType.NATIVE, submissionCount: 0,
    });
    formsService.findFormById.mockResolvedValueOnce({ id: 'form1', fields: [] });
    formsService.createSubmissionForForm.mockResolvedValueOnce({ submission: { data: {} }, contact: { id: 'c1' } });

    await service.submitPublic('promo', { data: {} } as any, {});

    expect(funnelsService.enroll).not.toHaveBeenCalled();
  });
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && npx jest landing-pages.service.spec.ts -t "funnel"`
Expected: FAIL — `FunnelsService` not injected, `submitPublic` never calls `enroll`.

- [ ] **Step 5: Wire `FunnelsService` into `LandingPagesService`**

```ts
// backend/src/landing-pages/landing-pages.service.ts
import { FunnelsService } from '../funnels/funnels.service';
// ...
  constructor(
    @InjectRepository(LandingPage)
    private readonly landingPageRepository: Repository<LandingPage>,
    private readonly formsService: FormsService,
    private readonly whatsappService: WhatsAppService,
    private readonly funnelsService: FunnelsService,
  ) {}
```

In `submitPublic`, right after the existing `await this.maybeSendWhatsAppWelcome(page, form, submission, contact);` line, add:

```ts
    if (page.funnelId) {
      this.funnelsService.enroll(contact, page.funnelId).catch((error: any) => {
        this.logger.error(`Funnel enroll for landing page ${page.id} failed (submit still succeeded): ${error?.message}`);
      });
    }
```

- [ ] **Step 6: Module wiring**

```ts
// backend/src/landing-pages/landing-pages.module.ts
import { FunnelsModule } from '../funnels/funnels.module';
// ...
  imports: [
    TypeOrmModule.forFeature([LandingPage]),
    FormsModule,
    WhatsAppModule,
    FunnelsModule,
  ],
```

- [ ] **Step 7: Add `funnelId` to the landing page DTOs**

```ts
// backend/src/landing-pages/dto/create-landing-page.dto.ts and update-landing-page.dto.ts (create-landing-page.dto.ts directly; update extends it via PartialType so no separate edit needed)
  @IsOptional()
  @IsUUID()
  funnelId?: string;
```

(Add `IsUUID` to the existing `class-validator` import line if not already imported.)

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && npx jest landing-pages.service.spec.ts`
Expected: PASS (all tests, including pre-existing ones)

- [ ] **Step 9: Full backend verification**

Run: `cd backend && npm run typecheck && npm run test`
Expected: no type errors, all tests pass.

- [ ] **Step 10: Commit**

```bash
git add backend/src/database/entities/landing-page.entity.ts backend/src/database/migrations/1786100000000-AddLandingPageFunnelId.ts backend/src/landing-pages backend/src/funnels
git commit -m "feat(landing-pages): auto-enroll new contacts into a linked funnel on submit"
```

---

### Task 10: Frontend types + WhatsApp flow editor additions (email step, anchorOffset, attendedNextStepId)

**Files:**
- Create: `frontend/types/funnel.ts`
- Modify: `frontend/app/(dashboard)/whatsapp/page.tsx`

**Interfaces:**
- Produces: `Funnel`, `FunnelEnrollment` TS types mirroring the backend entities (Task 11/12 import these).

- [ ] **Step 1: Types**

```ts
// frontend/types/funnel.ts
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
```

- [ ] **Step 2: Extend the flow step type in `whatsapp/page.tsx`**

Find the step type definition used by the editor (search for where `timeoutBranch` is typed, likely a local `FlowStep` interface near the top of the file or inline in the flows state). Add:

```ts
type?: 'template' | 'interactive' | 'email';
emailSubject?: string;
anchorOffset?: { relation: 'before' | 'after'; minutes: number };
attendedNextStepId?: string;
```

- [ ] **Step 3: Add UI controls near the existing timeout-branch block (~line 6598)**

Directly below the existing "No-reply follow-up" block, add two more collapsible sections following the exact same toggle+fields pattern:

```tsx
                        {/* Email step type toggle — mutually exclusive with template/interactive */}
                        <div className="border-t border-gray-200 pt-2 mt-1">
                          <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                            <input
                              type="checkbox"
                              checked={step.type === 'email'}
                              onChange={e => {
                                updateFlowStep(si, 'type', e.target.checked ? 'email' : undefined);
                                if (e.target.checked) updateFlowStep(si, 'emailSubject', step.emailSubject || '');
                              }}
                              className="h-3.5 w-3.5 rounded border-gray-300 accent-green-600"
                            />
                            Send as email instead of WhatsApp
                          </label>
                          {step.type === 'email' && (
                            <input
                              type="text"
                              placeholder="Email subject"
                              value={step.emailSubject || ''}
                              onChange={e => updateFlowStep(si, 'emailSubject', e.target.value)}
                              className="mt-1.5 w-full px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400"
                            />
                          )}
                        </div>

                        {/* Anchor-date timing — for a funnel step whose send time is computed from the funnel's anchorDate, not a relative delay */}
                        <div className="border-t border-gray-200 pt-2 mt-1">
                          <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                            <input
                              type="checkbox"
                              checked={!!step.anchorOffset}
                              onChange={e => updateFlowStep(si, 'anchorOffset', e.target.checked
                                ? { relation: 'before', minutes: 1440 }
                                : undefined)}
                              className="h-3.5 w-3.5 rounded border-gray-300 accent-green-600"
                            />
                            Time relative to funnel anchor date
                          </label>
                          {step.anchorOffset && (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <select
                                value={step.anchorOffset.relation}
                                onChange={e => updateFlowStep(si, 'anchorOffset', { ...step.anchorOffset, relation: e.target.value })}
                                className="px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 bg-white"
                              >
                                <option value="before">Before</option>
                                <option value="after">After</option>
                              </select>
                              <input
                                type="number"
                                min={1}
                                value={step.anchorOffset.minutes}
                                onChange={e => updateFlowStep(si, 'anchorOffset', { ...step.anchorOffset, minutes: Math.max(1, Number(e.target.value) || 1) })}
                                className="w-20 px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400"
                              />
                              <span className="text-[11px] text-gray-500">minutes (anchor date)</span>
                            </div>
                          )}
                        </div>

                        {/* Attended branch — sent immediately when someone toggles "mark attended" on this enrollment */}
                        <div className="border-t border-gray-200 pt-2 mt-1">
                          <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
                            <input
                              type="checkbox"
                              checked={!!step.attendedNextStepId}
                              onChange={e => updateFlowStep(si, 'attendedNextStepId', e.target.checked ? '' : undefined)}
                              className="h-3.5 w-3.5 rounded border-gray-300 accent-green-600"
                            />
                            On "mark attended", send
                          </label>
                          {step.attendedNextStepId !== undefined && (
                            <select
                              value={step.attendedNextStepId}
                              onChange={e => updateFlowStep(si, 'attendedNextStepId', e.target.value)}
                              className="mt-1.5 w-full px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-green-400 bg-white"
                            >
                              <option value="">Choose a step…</option>
                              {editingFlow.steps.filter((s: any) => s.id !== step.id).map((s: any) => (
                                <option key={s.id} value={s.id}>{s.id}</option>
                              ))}
                            </select>
                          )}
                        </div>
```

Follow the exact same `option`-population pattern the existing `timeoutBranch.nextStepId` dropdown in this file already uses (reuse that dropdown's step-listing logic rather than reinventing it, if it's a shared snippet/helper).

- [ ] **Step 4: Manual verification**

Run: `cd frontend && npm run dev`, open the WhatsApp integration page, edit a flow, add a step, confirm all three new toggles render, persist their values through save/reload (`saveFlows` round-trip), and don't crash the existing timeoutBranch/buttons UI.

- [ ] **Step 5: Commit**

```bash
git add frontend/types/funnel.ts "frontend/app/(dashboard)/whatsapp/page.tsx"
git commit -m "feat(whatsapp): flow editor support for email steps and anchor-dated timing"
```

---

### Task 11: Frontend — Funnels pages (list, create/edit, enrollments)

**Files:**
- Create: `frontend/app/(dashboard)/funnels/page.tsx`
- Create: `frontend/app/(dashboard)/funnels/new/page.tsx`
- Create: `frontend/app/(dashboard)/funnels/[id]/page.tsx`

**Interfaces:**
- Consumes: `Funnel`, `FunnelEnrollment` types from Task 10; `GET/POST/PATCH/DELETE /funnels`, `GET /funnels/:id/enrollments`, `PATCH /funnels/enrollments/:id/attended` from Task 8.

- [ ] **Step 1: List page**

```tsx
// frontend/app/(dashboard)/funnels/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { Plus, Workflow, Trash2, Edit } from 'lucide-react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';
import { Funnel } from '@/types/funnel';

export default function FunnelsPage() {
  const router = useRouter();
  const [funnels, setFunnels] = useState<Funnel[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchFunnels();
  }, []);

  const fetchFunnels = async () => {
    try {
      setIsLoading(true);
      const response = await api.get<Funnel[]>('/funnels');
      setFunnels(response.data);
    } catch (error) {
      console.error('Failed to fetch funnels:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this funnel?')) return;
    try {
      await api.delete(`/funnels/${id}`);
      setFunnels(funnels.filter((f) => f.id !== id));
    } catch (error) {
      console.error('Failed to delete funnel:', error);
    }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold flex items-center gap-2"><Workflow className="w-6 h-6" /> Funnels</h1>
        <button
          onClick={() => router.push('/funnels/new')}
          className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
        >
          <Plus className="w-4 h-4" /> New Funnel
        </button>
      </div>

      {isLoading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : funnels.length === 0 ? (
        <div className="text-sm text-gray-500">No funnels yet. Create one to auto-enroll landing page leads into a WhatsApp/email sequence.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {funnels.map((funnel) => (
            <div key={funnel.id} className="border border-gray-200 rounded-xl p-4 bg-white">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium">{funnel.name}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${funnel.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {funnel.status}
                </span>
              </div>
              {funnel.anchorDate && (
                <div className="text-xs text-gray-500 mb-3">Anchor: {new Date(funnel.anchorDate).toLocaleString()}</div>
              )}
              <div className="flex items-center gap-2">
                <button onClick={() => router.push(`/funnels/${funnel.id}`)} className="flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-lg hover:bg-gray-50">
                  <Edit className="w-3.5 h-3.5" /> Edit
                </button>
                <button onClick={() => handleDelete(funnel.id)} className="flex items-center gap-1 text-xs px-2 py-1 border border-gray-200 rounded-lg text-red-600 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
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

- [ ] **Step 2: New funnel page**

```tsx
// frontend/app/(dashboard)/funnels/new/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/api';

export default function NewFunnelPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [flows, setFlows] = useState<Array<{ id: string; name: string }>>([]);
  const [flowId, setFlowId] = useState('');
  const [integrationId, setIntegrationId] = useState('');
  const [anchorDate, setAnchorDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // The WhatsApp integration and its flows are already manageable at
    // /whatsapp — this page just needs to list them for the flow picker.
    api.get('/whatsapp/integration').then((res) => {
      setIntegrationId(res.data?.id || '');
      api.get('/whatsapp/flows').then((flowsRes) => setFlows(flowsRes.data || []));
    }).catch((error) => console.error('Failed to load WhatsApp integration/flows:', error));
  }, []);

  const handleSave = async () => {
    if (!name || !flowId || !integrationId) return;
    setSaving(true);
    try {
      const res = await api.post('/funnels', {
        name,
        flowId,
        integrationId,
        status: 'active',
        anchorDate: anchorDate ? new Date(anchorDate).toISOString() : undefined,
      });
      router.push(`/funnels/${res.data.id}`);
    } catch (error) {
      console.error('Failed to create funnel:', error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-semibold mb-6">New Funnel</h1>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg" placeholder="Webinar August 2026" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">WhatsApp flow</label>
          <select value={flowId} onChange={(e) => setFlowId(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white">
            <option value="">Choose a flow…</option>
            {flows.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <p className="text-xs text-gray-500 mt-1">Build/edit steps for this flow on the WhatsApp integration page.</p>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Anchor date (e.g. webinar date/time)</label>
          <input type="datetime-local" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg" />
        </div>
        <button onClick={handleSave} disabled={saving || !name || !flowId} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
          {saving ? 'Creating…' : 'Create Funnel'}
        </button>
      </div>
    </div>
  );
}
```

Note: `GET /whatsapp/integration` and `GET /whatsapp/flows` are assumed existing read endpoints backing the WhatsApp flow editor — confirm their actual routes with `grep -n "@Get" backend/src/integrations/whatsapp/whatsapp.controller.ts | grep -i flow` before wiring this up, and adjust the two `api.get(...)` calls to match whatever the real routes are if they differ.

- [ ] **Step 3: Edit + enrollments page**

```tsx
// frontend/app/(dashboard)/funnels/[id]/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { Funnel, FunnelEnrollment } from '@/types/funnel';

export default function FunnelDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [enrollments, setEnrollments] = useState<FunnelEnrollment[]>([]);

  useEffect(() => {
    api.get<Funnel>(`/funnels/${id}`).then((res) => setFunnel(res.data));
    api.get<FunnelEnrollment[]>(`/funnels/${id}/enrollments`).then((res) => setEnrollments(res.data));
  }, [id]);

  const toggleAttended = async (enrollmentId: string, current?: boolean) => {
    const res = await api.patch<FunnelEnrollment>(`/funnels/enrollments/${enrollmentId}/attended`, { attended: !current });
    setEnrollments((prev) => prev.map((e) => (e.id === enrollmentId ? res.data : e)));
  };

  if (!funnel) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-1">{funnel.name}</h1>
      {funnel.anchorDate && <p className="text-sm text-gray-500 mb-6">Anchor: {new Date(funnel.anchorDate).toLocaleString()}</p>}

      <h2 className="text-sm font-medium text-gray-600 mb-2">Enrollments ({enrollments.length})</h2>
      <table className="w-full text-sm border border-gray-200 rounded-lg overflow-hidden">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left px-3 py-2">WhatsApp</th>
            <th className="text-left px-3 py-2">Step</th>
            <th className="text-left px-3 py-2">Enrolled</th>
            <th className="text-left px-3 py-2">Attended</th>
          </tr>
        </thead>
        <tbody>
          {enrollments.map((e) => (
            <tr key={e.id} className="border-t border-gray-100">
              <td className="px-3 py-2">{e.waId}</td>
              <td className="px-3 py-2">{e.currentStepId || '—'}</td>
              <td className="px-3 py-2">{new Date(e.enrolledAt).toLocaleString()}</td>
              <td className="px-3 py-2">
                <button
                  onClick={() => toggleAttended(e.id, e.attendedManual)}
                  className={`text-xs px-2 py-1 rounded-full ${e.attendedManual ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                >
                  {e.attendedManual ? 'Attended' : 'Mark attended'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Manual verification**

Run: `cd frontend && npm run dev`, navigate to `/funnels`, create a funnel pointing at an existing WhatsApp flow, confirm it lists, confirm the detail page loads with an empty enrollments table, confirm the attended toggle round-trips against the backend once a real enrollment exists (from Task 12's landing page test).

- [ ] **Step 5: Commit**

```bash
git add "frontend/app/(dashboard)/funnels"
git commit -m "feat(funnels): frontend list/create/detail pages with enrollments + attended toggle"
```

---

### Task 12: Landing page editor — funnel picker

**Files:**
- Modify: `frontend/app/(dashboard)/landing-pages/_components/LandingPageEditor.tsx`
- Modify: `frontend/types/landing-page.ts` (add `funnelId?: string` to the `LandingPage` type)

**Interfaces:**
- Consumes: `Funnel` type from Task 10, `GET /funnels`.

- [ ] **Step 1: Add `funnelId` to the type**

```ts
// frontend/types/landing-page.ts — add alongside the existing formId field
funnelId?: string;
```

- [ ] **Step 2: Add the picker to the editor**

In `LandingPageEditor.tsx`, near wherever `formId`/`postSubmit.whatsapp` settings are edited (the "post-submit" configuration section), fetch the workspace's funnels on mount and add a dropdown:

```tsx
  const [funnels, setFunnels] = useState<Funnel[]>([]);

  useEffect(() => {
    api.get<Funnel[]>('/funnels').then((res) => setFunnels(res.data)).catch((error) => console.error('Failed to load funnels:', error));
  }, []);
```

```tsx
        <div>
          <label className="block text-sm font-medium mb-1">Auto-enroll into funnel (optional)</label>
          <select
            value={page.funnelId || ''}
            onChange={(e) => setPage({ ...page, funnelId: e.target.value || undefined })}
            className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-white"
          >
            <option value="">None</option>
            {funnels.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
```

Adapt the exact state-update call (`setPage`/`updateField`/whatever the component's actual state setter is named) to match the file's existing pattern for other fields like `formId` — read the surrounding code for the correct setter before writing this in.

- [ ] **Step 3: Manual verification**

Run: `cd frontend && npm run dev`, open a landing page in the editor, select a funnel, save, reload, confirm it persisted. Then submit that landing page's public form (`/p/<slug>`) end-to-end and confirm in the backend logs (or the funnel's enrollments page from Task 11) that a `FunnelEnrollment` was created and the WhatsApp confirmation step fired.

- [ ] **Step 4: Commit**

```bash
git add "frontend/app/(dashboard)/landing-pages/_components/LandingPageEditor.tsx" frontend/types/landing-page.ts
git commit -m "feat(landing-pages): link a landing page to a funnel from the editor"
```

---

## Self-Review

**Spec coverage:**
- "Extend `conversationFlows` step schema" (email type, anchorOffset) → Tasks 4, 10. ✓
- "New lightweight Funnel + FunnelEnrollment entities" → Task 1. ✓
- "Landing page → funnel link + auto-enroll" → Tasks 9, 12. ✓
- "Manual mark attended → branch signal" → Tasks 7, 8, 11. ✓ (implemented via the simpler `armFlowStepAt`/`attendedNextStepId` mechanism described in the Architecture section's deviation note, not the spec's literal `condition` field — functionally equivalent)
- "Dashboard UI" → Tasks 10, 11, 12. ✓
- Testing section of the spec (anchor-offset fire-time computation, arm-without-inbound-message, attended-mark routing, landing-page-submit integration, Fly-redeploy survival) → covered by Tasks 3, 4, 6, 7, 9's Jest tests; the Fly-redeploy durability check is inherited unmodified from the existing `timeoutBranch` mechanism (Task 2 only adds a field to the same already-durable job), so no new manual test was added for that specifically — flag this as a good manual smoke-test to run once deployed, not a gap in the code.

**Placeholder scan:** No TBD/TODO left in any task. The two spots that say "confirm before writing" (Task 4's `EmailService.send` signature, Task 10's flow-list endpoint routes) are flagged explicitly as a required grep-and-adjust step rather than left vague — both are one-line lookups against code that already exists, not open design questions.

**Type consistency:** `armFlowStepAt(workspaceId, waId, flowId, armedStepId, targetStepId, delayMs)` — parameter order and count match across Task 3 (definition), Task 6 (`enroll`), and Task 7 (`setAttended`). `FollowupCheckJobData.targetStepId` (Task 2) matches the `handleFollowupTimeout` 5th parameter (Task 3) matches the processor's destructure (Task 2 Step 4). `Funnel`/`FunnelEnrollment` field names are identical between the backend entities (Task 1) and the frontend types (Task 10).

---

Plan complete and saved to `docs/superpowers/plans/2026-08-23-webinar-lead-funnel.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
