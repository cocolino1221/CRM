import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDocuments1761753752737 implements MigrationInterface {
    name = 'AddDocuments1761753752737'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create enum types if they don't exist
        await queryRunner.query(`DO $$ BEGIN
            CREATE TYPE "public"."documents_type_enum" AS ENUM('contract', 'proposal', 'quote', 'invoice', 'nda', 'sow', 'msa', 'other');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;`);
        await queryRunner.query(`DO $$ BEGIN
            CREATE TYPE "public"."documents_status_enum" AS ENUM('draft', 'pending', 'sent', 'viewed', 'completed', 'signed', 'declined', 'expired', 'voided');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;`);
        await queryRunner.query(`DO $$ BEGIN
            CREATE TYPE "public"."documents_provider_enum" AS ENUM('pandadoc', 'docusign', 'internal');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;`);

        // Create documents table if it doesn't exist
        const tableExists = await queryRunner.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'documents'
            );
        `);

        if (!tableExists[0].exists) {
            await queryRunner.query(`CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "workspaceId" uuid NOT NULL, "name" character varying(255) NOT NULL, "type" "public"."documents_type_enum" NOT NULL DEFAULT 'other', "status" "public"."documents_status_enum" NOT NULL DEFAULT 'draft', "provider" "public"."documents_provider_enum" NOT NULL, "externalId" character varying(255), "description" text, "documentUrl" character varying(500), "signingUrl" character varying(500), "downloadUrl" character varying(500), "template" jsonb, "recipients" jsonb, "fields" jsonb, "metadata" jsonb, "sentAt" TIMESTAMP WITH TIME ZONE, "viewedAt" TIMESTAMP WITH TIME ZONE, "signedAt" TIMESTAMP WITH TIME ZONE, "expiresAt" TIMESTAMP WITH TIME ZONE, "voidedAt" TIMESTAMP WITH TIME ZONE, "voidReason" text, "auditTrail" jsonb, "createdById" uuid, "contactId" uuid, "dealId" uuid, "integrationId" uuid, CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id")); COMMENT ON COLUMN "documents"."createdAt" IS 'Record creation timestamp'; COMMENT ON COLUMN "documents"."updatedAt" IS 'Record last update timestamp'; COMMENT ON COLUMN "documents"."deletedAt" IS 'Soft delete timestamp'; COMMENT ON COLUMN "documents"."workspaceId" IS 'Workspace ID for multi-tenancy'; COMMENT ON COLUMN "documents"."name" IS 'Document name/title'; COMMENT ON COLUMN "documents"."type" IS 'Document type'; COMMENT ON COLUMN "documents"."status" IS 'Document status'; COMMENT ON COLUMN "documents"."provider" IS 'Document provider/platform'; COMMENT ON COLUMN "documents"."externalId" IS 'External document ID from provider'; COMMENT ON COLUMN "documents"."description" IS 'Document description'; COMMENT ON COLUMN "documents"."documentUrl" IS 'Document URL from provider'; COMMENT ON COLUMN "documents"."signingUrl" IS 'Signing URL for recipients'; COMMENT ON COLUMN "documents"."downloadUrl" IS 'Download URL for completed document'; COMMENT ON COLUMN "documents"."template" IS 'Document template information'; COMMENT ON COLUMN "documents"."recipients" IS 'Document recipients/signers'; COMMENT ON COLUMN "documents"."fields" IS 'Document field values'; COMMENT ON COLUMN "documents"."metadata" IS 'Document metadata from provider'; COMMENT ON COLUMN "documents"."sentAt" IS 'When document was sent'; COMMENT ON COLUMN "documents"."viewedAt" IS 'When document was first viewed'; COMMENT ON COLUMN "documents"."signedAt" IS 'When document was signed/completed'; COMMENT ON COLUMN "documents"."expiresAt" IS 'When document expires'; COMMENT ON COLUMN "documents"."voidedAt" IS 'When document was voided'; COMMENT ON COLUMN "documents"."voidReason" IS 'Void reason'; COMMENT ON COLUMN "documents"."auditTrail" IS 'Audit trail/history'`);
        }
        // Create indexes if they don't exist
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_type" ON "documents" ("type") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_status" ON "documents" ("status") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_created_at" ON "documents" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_external_id" ON "documents" ("externalId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_deal" ON "documents" ("dealId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_contact" ON "documents" ("contactId") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_created_by" ON "documents" ("createdById") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_workspace_type" ON "documents" ("workspaceId", "type") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_documents_workspace_status" ON "documents" ("workspaceId", "status") `);

        // Drop old index if exists
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_integrations_workspace_type"`);

        // Update integrations_type_enum
        const enumExists = await queryRunner.query(`
            SELECT EXISTS (
                SELECT 1 FROM pg_type
                WHERE typname = 'integrations_type_enum'
                AND typcategory = 'E'
            );
        `);

        if (enumExists[0].exists) {
            // Check if pandadoc and docusign are already in the enum
            const enumValues = await queryRunner.query(`
                SELECT e.enumlabel
                FROM pg_enum e
                JOIN pg_type t ON e.enumtypid = t.oid
                WHERE t.typname = 'integrations_type_enum';
            `);

            const labels = enumValues.map((v: any) => v.enumlabel);
            if (!labels.includes('pandadoc') || !labels.includes('docusign')) {
                // Need to update the enum
                await queryRunner.query(`ALTER TYPE "public"."integrations_type_enum" RENAME TO "integrations_type_enum_old"`);
                await queryRunner.query(`CREATE TYPE "public"."integrations_type_enum" AS ENUM('slack', 'google', 'microsoft', 'salesforce', 'hubspot', 'pipedrive', 'zoom', 'typeform', 'pandadoc', 'docusign', 'calendar', 'email', 'sms', 'social_media', 'webhook', 'api', 'database', 'custom')`);
                await queryRunner.query(`ALTER TABLE "integrations" ALTER COLUMN "type" TYPE "public"."integrations_type_enum" USING "type"::"text"::"public"."integrations_type_enum"`);
                await queryRunner.query(`DROP TYPE "public"."integrations_type_enum_old"`);
            }
        }

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_integrations_workspace_type" ON "integrations" ("workspaceId", "type") `);

        // Add foreign keys if they don't exist
        const fkExists1 = await queryRunner.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'FK_129be5647f7217471286e249c34'
                AND table_name = 'documents'
            );
        `);
        if (!fkExists1[0].exists) {
            await queryRunner.query(`ALTER TABLE "documents" ADD CONSTRAINT "FK_129be5647f7217471286e249c34" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        }

        const fkExists2 = await queryRunner.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'FK_393c61f8f333d2451d0d13098d0'
                AND table_name = 'documents'
            );
        `);
        if (!fkExists2[0].exists) {
            await queryRunner.query(`ALTER TABLE "documents" ADD CONSTRAINT "FK_393c61f8f333d2451d0d13098d0" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        }

        const fkExists3 = await queryRunner.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'FK_2002cf5422e6e01c9c907a6e6b4'
                AND table_name = 'documents'
            );
        `);
        if (!fkExists3[0].exists) {
            await queryRunner.query(`ALTER TABLE "documents" ADD CONSTRAINT "FK_2002cf5422e6e01c9c907a6e6b4" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        }

        const fkExists4 = await queryRunner.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'FK_7d750006857207f9379d8077735'
                AND table_name = 'documents'
            );
        `);
        if (!fkExists4[0].exists) {
            await queryRunner.query(`ALTER TABLE "documents" ADD CONSTRAINT "FK_7d750006857207f9379d8077735" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT "FK_7d750006857207f9379d8077735"`);
        await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT "FK_2002cf5422e6e01c9c907a6e6b4"`);
        await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT "FK_393c61f8f333d2451d0d13098d0"`);
        await queryRunner.query(`ALTER TABLE "documents" DROP CONSTRAINT "FK_129be5647f7217471286e249c34"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_integrations_workspace_type"`);
        await queryRunner.query(`CREATE TYPE "public"."integrations_type_enum_old" AS ENUM('slack', 'google', 'microsoft', 'salesforce', 'hubspot', 'pipedrive', 'zoom', 'typeform', 'calendar', 'email', 'sms', 'social_media', 'webhook', 'api', 'database', 'custom')`);
        await queryRunner.query(`ALTER TABLE "integrations" ALTER COLUMN "type" TYPE "public"."integrations_type_enum_old" USING "type"::"text"::"public"."integrations_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."integrations_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."integrations_type_enum_old" RENAME TO "integrations_type_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_integrations_workspace_type" ON "integrations" ("type", "workspaceId") `);
        await queryRunner.query(`DROP INDEX "public"."IDX_documents_workspace_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_documents_workspace_type"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_documents_created_by"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_documents_contact"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_documents_deal"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_documents_external_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_documents_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_documents_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_documents_type"`);
        await queryRunner.query(`DROP TABLE "documents"`);
        await queryRunner.query(`DROP TYPE "public"."documents_provider_enum"`);
        await queryRunner.query(`DROP TYPE "public"."documents_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."documents_type_enum"`);
    }

}
