import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Per-workspace landing page hostnames.
 *
 * Also moves landing page slugs from globally unique to unique per workspace.
 * Two customers must both be able to publish "oferta" on their own domains,
 * and the old constraint made the first one to use a slug the only one who
 * ever could. This is done now, while the table holds a single row; after a
 * few dozen customers have pages it becomes a rename-everyone migration.
 */
export class AddLandingDomains1792260000000 implements MigrationInterface {
  name = 'AddLandingDomains1792260000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."landing_domains_status_enum" AS ENUM ('pending', 'active', 'failed');
      EXCEPTION WHEN duplicate_object THEN null; END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "landing_domains" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "workspaceId" uuid NOT NULL,
        "hostname" character varying(253) NOT NULL,
        "status" "public"."landing_domains_status_enum" NOT NULL DEFAULT 'pending',
        "verificationToken" character varying(100) NOT NULL,
        "verifiedAt" TIMESTAMP WITH TIME ZONE,
        "lastCheckedAt" TIMESTAMP WITH TIME ZONE,
        "lastError" text,
        "isPrimary" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_landing_domains" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_landing_domains_hostname" UNIQUE ("hostname")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_landing_domains_workspace"
        ON "landing_domains" ("workspaceId")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_landing_domains_hostname"
        ON "landing_domains" ("hostname")
    `);

    // A slug only has to be unique within the workspace that owns it, now
    // that a hostname decides which workspace a request belongs to.
    await queryRunner.query(`
      ALTER TABLE "landing_pages"
        DROP CONSTRAINT IF EXISTS "UQ_70ad771a756224c84875d2870a7"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_landing_pages_workspace_slug"
        ON "landing_pages" ("workspaceId", "slug")
        WHERE "deletedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_landing_pages_workspace_slug"`);
    // Restoring the global constraint can fail if two workspaces have since
    // used the same slug, which is exactly what this migration allowed.
    await queryRunner.query(`
      ALTER TABLE "landing_pages"
        ADD CONSTRAINT "UQ_70ad771a756224c84875d2870a7" UNIQUE ("slug")
    `);
    await queryRunner.query(`DROP TABLE IF EXISTS "landing_domains"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."landing_domains_status_enum"`);
  }
}
