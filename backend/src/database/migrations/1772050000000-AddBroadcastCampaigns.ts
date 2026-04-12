import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBroadcastCampaigns1772050000000 implements MigrationInterface {
  name = 'AddBroadcastCampaigns1772050000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // ── WhatsApp campaigns table ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE "public"."whatsapp_campaigns_status_enum"
      AS ENUM('draft', 'scheduled', 'sending', 'sent', 'failed')
    `);

    await queryRunner.query(`
      CREATE TABLE "whatsapp_campaigns" (
        "id"           uuid                        NOT NULL DEFAULT uuid_generate_v4(),
        "createdAt"    TIMESTAMP WITH TIME ZONE    NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMP WITH TIME ZONE    NOT NULL DEFAULT now(),
        "deletedAt"    TIMESTAMP WITH TIME ZONE,
        "workspaceId"  uuid                        NOT NULL,
        "name"         character varying(255)      NOT NULL,
        "templateName" character varying(255)      NOT NULL,
        "language"     character varying(20)       NOT NULL DEFAULT 'pt_BR',
        "templateParams" jsonb                     DEFAULT '[]',
        "csvRecipients"  jsonb                     DEFAULT '[]',
        "status"       "public"."whatsapp_campaigns_status_enum" NOT NULL DEFAULT 'draft',
        "scheduledAt"  TIMESTAMP WITH TIME ZONE,
        "sentAt"       TIMESTAMP WITH TIME ZONE,
        "stats"        jsonb                       DEFAULT '{}',
        "createdById"  character varying,
        CONSTRAINT "PK_whatsapp_campaigns" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_wa_campaigns_workspace"  ON "whatsapp_campaigns" ("workspaceId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wa_campaigns_scheduled"  ON "whatsapp_campaigns" ("status", "scheduledAt")`,
    );

    // ── Add csvRecipients column to email_campaigns ──────────────────────────
    await queryRunner.query(`
      ALTER TABLE "email_campaigns"
      ADD COLUMN IF NOT EXISTS "csvRecipients" jsonb DEFAULT '[]'
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "email_campaigns" DROP COLUMN IF EXISTS "csvRecipients"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_wa_campaigns_scheduled"`);
    await queryRunner.query(`DROP INDEX "IDX_wa_campaigns_workspace"`);
    await queryRunner.query(`DROP TABLE "whatsapp_campaigns"`);
    await queryRunner.query(`DROP TYPE "public"."whatsapp_campaigns_status_enum"`);
  }
}
