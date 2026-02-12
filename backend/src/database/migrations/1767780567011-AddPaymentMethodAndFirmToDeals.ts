import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPaymentMethodAndFirmToDeals1767780567011 implements MigrationInterface {
    name = 'AddPaymentMethodAndFirmToDeals1767780567011'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create workflow enums if they don't exist
        await queryRunner.query(`DO $$ BEGIN
            CREATE TYPE "public"."workflows_status_enum" AS ENUM('active', 'paused', 'draft', 'error');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;`);

        await queryRunner.query(`DO $$ BEGIN
            CREATE TYPE "public"."workflows_triggertype_enum" AS ENUM('contact.created', 'contact.updated', 'deal.created', 'deal.updated', 'deal.won', 'deal.lost', 'task.created', 'task.completed', 'form.submitted', 'email.received', 'webhook', 'schedule', 'payment.received');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;`);

        await queryRunner.query(`DO $$ BEGIN
            CREATE TYPE "public"."workflow_executions_status_enum" AS ENUM('success', 'failed', 'partial');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;`);

        await queryRunner.query(`DO $$ BEGIN
            CREATE TYPE "public"."deals_paymentmethod_enum" AS ENUM('integral', 'rate', 'bill');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;`);

        await queryRunner.query(`DO $$ BEGIN
            CREATE TYPE "public"."deals_firm_enum" AS ENUM('old', 'new', 'dubai');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;`);

        // Create workflows table if it doesn't exist
        const workflowsTableExists = await queryRunner.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'workflows'
            );
        `);

        if (!workflowsTableExists[0].exists) {
            await queryRunner.query(`CREATE TABLE "workflows" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "workspaceId" uuid NOT NULL, "name" character varying(255) NOT NULL, "description" text, "status" "public"."workflows_status_enum" NOT NULL DEFAULT 'draft', "triggerType" "public"."workflows_triggertype_enum" NOT NULL, "triggerConfig" jsonb, "actions" jsonb NOT NULL, "executionCount" integer NOT NULL DEFAULT '0', "lastExecutedAt" TIMESTAMP WITH TIME ZONE, "lastError" jsonb, "createdBy" uuid NOT NULL, CONSTRAINT "PK_5b5757cc1cd86268019fef52e0c" PRIMARY KEY ("id")); COMMENT ON COLUMN "workflows"."createdAt" IS 'Record creation timestamp'; COMMENT ON COLUMN "workflows"."updatedAt" IS 'Record last update timestamp'; COMMENT ON COLUMN "workflows"."deletedAt" IS 'Soft delete timestamp'; COMMENT ON COLUMN "workflows"."workspaceId" IS 'Workspace ID for multi-tenancy'`);
        }

        // Create workflow_executions table if it doesn't exist
        const executionsTableExists = await queryRunner.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'workflow_executions'
            );
        `);

        if (!executionsTableExists[0].exists) {
            await queryRunner.query(`CREATE TABLE "workflow_executions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "workspaceId" uuid NOT NULL, "workflowId" uuid NOT NULL, "status" "public"."workflow_executions_status_enum" NOT NULL, "triggerData" jsonb, "results" jsonb, "errors" jsonb, "durationMs" integer, "startedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "completedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_9d49b5c86c267d902145ed42c9d" PRIMARY KEY ("id")); COMMENT ON COLUMN "workflow_executions"."createdAt" IS 'Record creation timestamp'; COMMENT ON COLUMN "workflow_executions"."updatedAt" IS 'Record last update timestamp'; COMMENT ON COLUMN "workflow_executions"."deletedAt" IS 'Soft delete timestamp'; COMMENT ON COLUMN "workflow_executions"."workspaceId" IS 'Workspace ID for multi-tenancy'`);
        }

        // Add paymentMethod column to deals if it doesn't exist
        const paymentMethodExists = await queryRunner.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'deals'
                AND column_name = 'paymentMethod'
            );
        `);

        if (!paymentMethodExists[0].exists) {
            await queryRunner.query(`ALTER TABLE "deals" ADD "paymentMethod" "public"."deals_paymentmethod_enum"`);
            await queryRunner.query(`COMMENT ON COLUMN "deals"."paymentMethod" IS 'Payment method when deal is closed won'`);
        }

        // Add firm column to deals if it doesn't exist
        const firmExists = await queryRunner.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.columns
                WHERE table_name = 'deals'
                AND column_name = 'firm'
            );
        `);

        if (!firmExists[0].exists) {
            await queryRunner.query(`ALTER TABLE "deals" ADD "firm" "public"."deals_firm_enum"`);
            await queryRunner.query(`COMMENT ON COLUMN "deals"."firm" IS 'Firm selected for rate or bill payment methods'`);
        }
        // Update contacts_source_enum if kajabi is not present
        const contactsSourceEnum = await queryRunner.query(`
            SELECT e.enumlabel
            FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'contacts_source_enum';
        `);

        const contactSourceLabels = contactsSourceEnum.map((v: any) => v.enumlabel);
        if (!contactSourceLabels.includes('kajabi')) {
            await queryRunner.query(`ALTER TYPE "public"."contacts_source_enum" RENAME TO "contacts_source_enum_old"`);
            await queryRunner.query(`CREATE TYPE "public"."contacts_source_enum" AS ENUM('manual', 'website', 'referral', 'social_media', 'email_campaign', 'cold_outreach', 'event', 'slack', 'typeform', 'whatsapp', 'facebook', 'instagram', 'linkedin', 'google-ads', 'kajabi', 'other')`);
            await queryRunner.query(`ALTER TABLE "contacts" ALTER COLUMN "source" TYPE "public"."contacts_source_enum" USING "source"::"text"::"public"."contacts_source_enum"`);
            await queryRunner.query(`DROP TYPE "public"."contacts_source_enum_old"`);
        }

        // Update integrations_type_enum if kajabi is not present
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_integrations_workspace_type"`);

        const integrationsEnum = await queryRunner.query(`
            SELECT e.enumlabel
            FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'integrations_type_enum';
        `);

        const integrationLabels = integrationsEnum.map((v: any) => v.enumlabel);
        if (!integrationLabels.includes('kajabi')) {
            await queryRunner.query(`ALTER TYPE "public"."integrations_type_enum" RENAME TO "integrations_type_enum_old"`);
            await queryRunner.query(`CREATE TYPE "public"."integrations_type_enum" AS ENUM('slack', 'google', 'microsoft', 'salesforce', 'hubspot', 'pipedrive', 'zoom', 'typeform', 'pandadoc', 'docusign', 'calendly', 'kajabi', 'whatsapp', 'calendar', 'email', 'sms', 'social_media', 'webhook', 'api', 'database', 'custom')`);
            await queryRunner.query(`ALTER TABLE "integrations" ALTER COLUMN "type" TYPE "public"."integrations_type_enum" USING "type"::"text"::"public"."integrations_type_enum"`);
            await queryRunner.query(`DROP TYPE "public"."integrations_type_enum_old"`);
        }

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_integrations_workspace_type" ON "integrations" ("workspaceId", "type") `);

        // Add foreign keys if they don't exist
        const fk1Exists = await queryRunner.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'FK_2d3b556a484251c8d3456b62716'
                AND table_name = 'workflows'
            );
        `);
        if (!fk1Exists[0].exists) {
            await queryRunner.query(`ALTER TABLE "workflows" ADD CONSTRAINT "FK_2d3b556a484251c8d3456b62716" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        }

        const fk2Exists = await queryRunner.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'FK_2cb399c231cb3f82c63506794bc'
                AND table_name = 'workflow_executions'
            );
        `);
        if (!fk2Exists[0].exists) {
            await queryRunner.query(`ALTER TABLE "workflow_executions" ADD CONSTRAINT "FK_2cb399c231cb3f82c63506794bc" FOREIGN KEY ("workflowId") REFERENCES "workflows"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workflow_executions" DROP CONSTRAINT "FK_2cb399c231cb3f82c63506794bc"`);
        await queryRunner.query(`ALTER TABLE "workflows" DROP CONSTRAINT "FK_2d3b556a484251c8d3456b62716"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_integrations_workspace_type"`);
        await queryRunner.query(`CREATE TYPE "public"."integrations_type_enum_old" AS ENUM('api', 'calendar', 'calendly', 'custom', 'database', 'docusign', 'email', 'google', 'hubspot', 'microsoft', 'pandadoc', 'pipedrive', 'salesforce', 'slack', 'sms', 'social_media', 'typeform', 'webhook', 'whatsapp', 'zoom')`);
        await queryRunner.query(`ALTER TABLE "integrations" ALTER COLUMN "type" TYPE "public"."integrations_type_enum_old" USING "type"::"text"::"public"."integrations_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."integrations_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."integrations_type_enum_old" RENAME TO "integrations_type_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_integrations_workspace_type" ON "integrations" ("type", "workspaceId") `);
        await queryRunner.query(`CREATE TYPE "public"."contacts_source_enum_old" AS ENUM('cold_outreach', 'email_campaign', 'event', 'facebook', 'google-ads', 'instagram', 'linkedin', 'manual', 'other', 'referral', 'slack', 'social_media', 'typeform', 'website', 'whatsapp')`);
        await queryRunner.query(`ALTER TABLE "contacts" ALTER COLUMN "source" TYPE "public"."contacts_source_enum_old" USING "source"::"text"::"public"."contacts_source_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."contacts_source_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."contacts_source_enum_old" RENAME TO "contacts_source_enum"`);
        await queryRunner.query(`COMMENT ON COLUMN "deals"."firm" IS 'Firm selected for rate or bill payment methods'`);
        await queryRunner.query(`ALTER TABLE "deals" DROP COLUMN "firm"`);
        await queryRunner.query(`DROP TYPE "public"."deals_firm_enum"`);
        await queryRunner.query(`COMMENT ON COLUMN "deals"."paymentMethod" IS 'Payment method when deal is closed won'`);
        await queryRunner.query(`ALTER TABLE "deals" DROP COLUMN "paymentMethod"`);
        await queryRunner.query(`DROP TYPE "public"."deals_paymentmethod_enum"`);
        await queryRunner.query(`DROP TABLE "workflow_executions"`);
        await queryRunner.query(`DROP TYPE "public"."workflow_executions_status_enum"`);
        await queryRunner.query(`DROP TABLE "workflows"`);
        await queryRunner.query(`DROP TYPE "public"."workflows_triggertype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."workflows_status_enum"`);
    }

}
