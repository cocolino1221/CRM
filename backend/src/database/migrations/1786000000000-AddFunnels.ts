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
