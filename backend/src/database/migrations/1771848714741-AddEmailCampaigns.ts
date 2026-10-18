import { MigrationInterface, QueryRunner } from "typeorm";

export class AddEmailCampaigns1771848714741 implements MigrationInterface {
    name = 'AddEmailCampaigns1771848714741'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."email_campaigns_status_enum" AS ENUM('draft', 'scheduled', 'sending', 'sent', 'failed')`);
        await queryRunner.query(`CREATE TABLE "email_campaigns" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "workspaceId" uuid NOT NULL, "name" character varying(255) NOT NULL, "subject" character varying(500) NOT NULL, "htmlBody" text, "textBody" text, "status" "public"."email_campaigns_status_enum" NOT NULL DEFAULT 'draft', "scheduledAt" TIMESTAMP WITH TIME ZONE, "sentAt" TIMESTAMP WITH TIME ZONE, "filters" jsonb DEFAULT '{}', "stats" jsonb DEFAULT '{}', "createdById" uuid NOT NULL, CONSTRAINT "PK_72bad329795785308e66d562350" PRIMARY KEY ("id")); COMMENT ON COLUMN "email_campaigns"."createdAt" IS 'Record creation timestamp'; COMMENT ON COLUMN "email_campaigns"."updatedAt" IS 'Record last update timestamp'; COMMENT ON COLUMN "email_campaigns"."deletedAt" IS 'Soft delete timestamp'; COMMENT ON COLUMN "email_campaigns"."workspaceId" IS 'Workspace ID for multi-tenancy'`);
        await queryRunner.query(`CREATE INDEX "IDX_email_campaigns_status" ON "email_campaigns" ("workspaceId", "status") `);
        await queryRunner.query(`CREATE INDEX "IDX_email_campaigns_workspace" ON "email_campaigns" ("workspaceId") `);
        await queryRunner.query(`ALTER TABLE "email_campaigns" ADD CONSTRAINT "FK_1113c9157d634ca475fd4419998" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "email_campaigns" DROP CONSTRAINT "FK_1113c9157d634ca475fd4419998"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_email_campaigns_workspace"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_email_campaigns_status"`);
        await queryRunner.query(`DROP TABLE "email_campaigns"`);
        await queryRunner.query(`DROP TYPE "public"."email_campaigns_status_enum"`);
    }

}
