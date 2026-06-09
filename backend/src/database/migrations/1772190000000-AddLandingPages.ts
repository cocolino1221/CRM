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
