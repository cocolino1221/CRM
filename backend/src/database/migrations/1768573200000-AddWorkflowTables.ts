import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWorkflowTables1768573200000 implements MigrationInterface {
  name = 'AddWorkflowTables1768573200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`DO $$ BEGIN
        CREATE TYPE "public"."workflows_status_enum" AS ENUM('active', 'paused', 'draft', 'error');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;`);

    await queryRunner.query(`DO $$ BEGIN
        CREATE TYPE "public"."workflows_triggertype_enum" AS ENUM(
          'contact.created', 'contact.updated',
          'deal.created', 'deal.updated', 'deal.won', 'deal.lost',
          'task.created', 'task.completed',
          'form.submitted', 'email.received',
          'webhook', 'schedule', 'payment.received'
        );
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;`);

    await queryRunner.query(`DO $$ BEGIN
        CREATE TYPE "public"."workflow_executions_status_enum" AS ENUM('success', 'failed', 'partial');
    EXCEPTION
        WHEN duplicate_object THEN null;
    END $$;`);

    // Create workflows table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflows" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "workspaceId" uuid NOT NULL,
        "name" character varying(255) NOT NULL,
        "description" text,
        "status" "public"."workflows_status_enum" NOT NULL DEFAULT 'draft',
        "triggerType" "public"."workflows_triggertype_enum" NOT NULL,
        "triggerConfig" jsonb,
        "actions" jsonb NOT NULL,
        "executionCount" integer NOT NULL DEFAULT '0',
        "lastExecutedAt" TIMESTAMP WITH TIME ZONE,
        "lastError" jsonb,
        "createdBy" uuid NOT NULL,
        CONSTRAINT "PK_workflows" PRIMARY KEY ("id")
      );
    `);

    // Create workflow_executions table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "workflow_executions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        "workspaceId" uuid NOT NULL,
        "workflowId" uuid NOT NULL,
        "status" "public"."workflow_executions_status_enum" NOT NULL,
        "triggerData" jsonb,
        "results" jsonb,
        "errors" jsonb,
        "durationMs" integer,
        "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "completedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_workflow_executions" PRIMARY KEY ("id")
      );
    `);

    // Add foreign keys if tables exist
    const workflowTableExists = await queryRunner.query(
      `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workflows');`
    );

    if (workflowTableExists[0].exists) {
      // Add FK to workspaces
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE "workflows" ADD CONSTRAINT "FK_workflows_workspace"
            FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // Add FK to users
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE "workflows" ADD CONSTRAINT "FK_workflows_creator"
            FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // Add FK for workflow_executions
      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE "workflow_executions" ADD CONSTRAINT "FK_workflow_executions_workspace"
            FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      await queryRunner.query(`
        DO $$ BEGIN
          ALTER TABLE "workflow_executions" ADD CONSTRAINT "FK_workflow_executions_workflow"
            FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);
    }

    // Create indexes
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_workflows_workspace" ON "workflows" ("workspaceId");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_workflows_creator" ON "workflows" ("createdBy");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_workflows_status" ON "workflows" ("status");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_workflows_trigger_type" ON "workflows" ("triggerType");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_workflow_executions_workspace" ON "workflow_executions" ("workspaceId");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_workflow_executions_workflow" ON "workflow_executions" ("workflowId");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_workflow_executions_status" ON "workflow_executions" ("status");`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_workflow_executions_started_at" ON "workflow_executions" ("startedAt");`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workflow_executions_started_at";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workflow_executions_status";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workflow_executions_workflow";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workflow_executions_workspace";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workflows_trigger_type";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workflows_status";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workflows_creator";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_workflows_workspace";`);

    // Drop foreign keys
    await queryRunner.query(`ALTER TABLE "workflow_executions" DROP CONSTRAINT IF EXISTS "FK_workflow_executions_workflow";`);
    await queryRunner.query(`ALTER TABLE "workflow_executions" DROP CONSTRAINT IF EXISTS "FK_workflow_executions_workspace";`);
    await queryRunner.query(`ALTER TABLE "workflows" DROP CONSTRAINT IF EXISTS "FK_workflows_creator";`);
    await queryRunner.query(`ALTER TABLE "workflows" DROP CONSTRAINT IF EXISTS "FK_workflows_workspace";`);

    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS "workflow_executions";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "workflows";`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."workflow_executions_status_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."workflows_triggertype_enum";`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."workflows_status_enum";`);
  }
}
