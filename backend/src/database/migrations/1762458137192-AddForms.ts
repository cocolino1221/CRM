import { MigrationInterface, QueryRunner } from "typeorm";

export class AddForms1762458137192 implements MigrationInterface {
    name = 'AddForms1762458137192'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create enums if they don't exist
        await queryRunner.query(`DO $$ BEGIN
            CREATE TYPE "public"."form_submissions_status_enum" AS ENUM('new', 'reviewed', 'converted', 'spam');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;`);

        await queryRunner.query(`DO $$ BEGIN
            CREATE TYPE "public"."forms_status_enum" AS ENUM('draft', 'active', 'archived');
        EXCEPTION
            WHEN duplicate_object THEN null;
        END $$;`);

        // Check if forms table exists
        const formsTableExists = await queryRunner.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'forms'
            );
        `);

        if (!formsTableExists[0].exists) {
            await queryRunner.query(`CREATE TABLE "forms" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "workspaceId" uuid NOT NULL, "name" character varying(255) NOT NULL, "description" text, "status" "public"."forms_status_enum" NOT NULL DEFAULT 'draft', "fields" jsonb NOT NULL, "settings" jsonb, "slug" character varying(100) NOT NULL, "submissionCount" integer NOT NULL DEFAULT '0', "viewCount" integer NOT NULL DEFAULT '0', "lastSubmittedAt" TIMESTAMP WITH TIME ZONE, "createdById" uuid NOT NULL, CONSTRAINT "UQ_beb11480ce7ba6813fe893723a1" UNIQUE ("slug"), CONSTRAINT "PK_ba062fd30b06814a60756f233da" PRIMARY KEY ("id")); COMMENT ON COLUMN "forms"."createdAt" IS 'Record creation timestamp'; COMMENT ON COLUMN "forms"."updatedAt" IS 'Record last update timestamp'; COMMENT ON COLUMN "forms"."deletedAt" IS 'Soft delete timestamp'; COMMENT ON COLUMN "forms"."workspaceId" IS 'Workspace ID for multi-tenancy'; COMMENT ON COLUMN "forms"."name" IS 'Form name'; COMMENT ON COLUMN "forms"."description" IS 'Form description'; COMMENT ON COLUMN "forms"."status" IS 'Form status'; COMMENT ON COLUMN "forms"."fields" IS 'Form fields configuration'; COMMENT ON COLUMN "forms"."settings" IS 'Form settings'; COMMENT ON COLUMN "forms"."slug" IS 'Unique form slug for public URL'; COMMENT ON COLUMN "forms"."submissionCount" IS 'Number of form submissions'; COMMENT ON COLUMN "forms"."viewCount" IS 'Number of form views'; COMMENT ON COLUMN "forms"."lastSubmittedAt" IS 'Last submission date'`);
        }

        // Check if form_submissions table exists
        const submissionsTableExists = await queryRunner.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables
                WHERE table_schema = 'public'
                AND table_name = 'form_submissions'
            );
        `);

        if (!submissionsTableExists[0].exists) {
            await queryRunner.query(`CREATE TABLE "form_submissions" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "formId" uuid NOT NULL, "data" jsonb NOT NULL, "status" "public"."form_submissions_status_enum" NOT NULL DEFAULT 'new', "ipAddress" character varying(45), "userAgent" character varying(500), "referrer" character varying(500), "trackingData" jsonb, "contactId" uuid, "reviewedAt" TIMESTAMP WITH TIME ZONE, "notes" text, CONSTRAINT "PK_fb6e1e9f26cda31c358a8a1530e" PRIMARY KEY ("id")); COMMENT ON COLUMN "form_submissions"."createdAt" IS 'Record creation timestamp'; COMMENT ON COLUMN "form_submissions"."updatedAt" IS 'Record last update timestamp'; COMMENT ON COLUMN "form_submissions"."deletedAt" IS 'Soft delete timestamp'; COMMENT ON COLUMN "form_submissions"."data" IS 'Form submission data'; COMMENT ON COLUMN "form_submissions"."status" IS 'Submission status'; COMMENT ON COLUMN "form_submissions"."ipAddress" IS 'Submitter IP address'; COMMENT ON COLUMN "form_submissions"."userAgent" IS 'User agent'; COMMENT ON COLUMN "form_submissions"."referrer" IS 'Referrer URL'; COMMENT ON COLUMN "form_submissions"."trackingData" IS 'UTM parameters and tracking data'; COMMENT ON COLUMN "form_submissions"."reviewedAt" IS 'When submission was reviewed'; COMMENT ON COLUMN "form_submissions"."notes" IS 'Review notes'`);
        }

        // Create indexes if they don't exist
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_submissions_status" ON "form_submissions" ("status") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_submissions_form_created" ON "form_submissions" ("formId", "createdAt") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_submissions_form_status" ON "form_submissions" ("formId", "status") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_forms_status" ON "forms" ("status") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_forms_slug" ON "forms" ("slug") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_forms_workspace_status" ON "forms" ("workspaceId", "status") `);

        // Add foreign keys if they don't exist
        const fk1Exists = await queryRunner.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'FK_6bb44ead8acd515f1333e5309bf'
                AND table_name = 'form_submissions'
            );
        `);
        if (!fk1Exists[0].exists) {
            await queryRunner.query(`ALTER TABLE "form_submissions" ADD CONSTRAINT "FK_6bb44ead8acd515f1333e5309bf" FOREIGN KEY ("formId") REFERENCES "forms"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        }

        const fk2Exists = await queryRunner.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'FK_a4b39f1fe022573d6b93039de93'
                AND table_name = 'form_submissions'
            );
        `);
        if (!fk2Exists[0].exists) {
            await queryRunner.query(`ALTER TABLE "form_submissions" ADD CONSTRAINT "FK_a4b39f1fe022573d6b93039de93" FOREIGN KEY ("contactId") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        }

        const fk3Exists = await queryRunner.query(`
            SELECT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_name = 'FK_f23856f1dce6ad13fe2c8d3a5d9'
                AND table_name = 'forms'
            );
        `);
        if (!fk3Exists[0].exists) {
            await queryRunner.query(`ALTER TABLE "forms" ADD CONSTRAINT "FK_f23856f1dce6ad13fe2c8d3a5d9" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "forms" DROP CONSTRAINT "FK_f23856f1dce6ad13fe2c8d3a5d9"`);
        await queryRunner.query(`ALTER TABLE "form_submissions" DROP CONSTRAINT "FK_a4b39f1fe022573d6b93039de93"`);
        await queryRunner.query(`ALTER TABLE "form_submissions" DROP CONSTRAINT "FK_6bb44ead8acd515f1333e5309bf"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_forms_workspace_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_forms_slug"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_forms_status"`);
        await queryRunner.query(`DROP TABLE "forms"`);
        await queryRunner.query(`DROP TYPE "public"."forms_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_submissions_form_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_submissions_form_created"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_submissions_status"`);
        await queryRunner.query(`DROP TABLE "form_submissions"`);
        await queryRunner.query(`DROP TYPE "public"."form_submissions_status_enum"`);
    }

}
