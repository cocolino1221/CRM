import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIntegrations1759160199961 implements MigrationInterface {
    name = 'AddIntegrations1759160199961'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."integrations_type_enum" AS ENUM('slack', 'google', 'microsoft', 'salesforce', 'hubspot', 'pipedrive', 'zoom', 'calendar', 'email', 'sms', 'social_media', 'webhook', 'api', 'database', 'custom')`);
        await queryRunner.query(`CREATE TYPE "public"."integrations_status_enum" AS ENUM('pending', 'active', 'error', 'disabled', 'expired', 'suspended')`);
        await queryRunner.query(`CREATE TYPE "public"."integrations_authtype_enum" AS ENUM('oauth2', 'api_key', 'basic_auth', 'jwt', 'webhook', 'none')`);
        await queryRunner.query(`CREATE TABLE "integrations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "workspaceId" uuid NOT NULL, "type" "public"."integrations_type_enum" NOT NULL, "name" character varying(255) NOT NULL, "description" text, "status" "public"."integrations_status_enum" NOT NULL DEFAULT 'pending', "authType" "public"."integrations_authtype_enum" NOT NULL, "externalId" character varying(255), "config" jsonb, "credentials" jsonb, "lastSync" jsonb, "metadata" jsonb, "permissions" text, "isEnabled" boolean NOT NULL DEFAULT true, "isVerified" boolean NOT NULL DEFAULT false, "lastActivityAt" TIMESTAMP WITH TIME ZONE, "expiresAt" TIMESTAMP WITH TIME ZONE, "lastError" text, "errorCount" integer NOT NULL DEFAULT '0', "installedAt" TIMESTAMP WITH TIME ZONE, "userId" uuid, CONSTRAINT "PK_9adcdc6d6f3922535361ce641e8" PRIMARY KEY ("id")); COMMENT ON COLUMN "integrations"."createdAt" IS 'Record creation timestamp'; COMMENT ON COLUMN "integrations"."updatedAt" IS 'Record last update timestamp'; COMMENT ON COLUMN "integrations"."deletedAt" IS 'Soft delete timestamp'; COMMENT ON COLUMN "integrations"."workspaceId" IS 'Workspace ID for multi-tenancy'; COMMENT ON COLUMN "integrations"."type" IS 'Type of integration'; COMMENT ON COLUMN "integrations"."name" IS 'Integration display name'; COMMENT ON COLUMN "integrations"."description" IS 'Integration description'; COMMENT ON COLUMN "integrations"."status" IS 'Integration status'; COMMENT ON COLUMN "integrations"."authType" IS 'Authentication type'; COMMENT ON COLUMN "integrations"."externalId" IS 'External service ID/key'; COMMENT ON COLUMN "integrations"."config" IS 'Integration configuration settings'; COMMENT ON COLUMN "integrations"."credentials" IS 'Encrypted authentication credentials'; COMMENT ON COLUMN "integrations"."lastSync" IS 'Last sync information'; COMMENT ON COLUMN "integrations"."metadata" IS 'Integration metadata'; COMMENT ON COLUMN "integrations"."permissions" IS 'Integration capabilities/permissions'; COMMENT ON COLUMN "integrations"."isEnabled" IS 'Is integration enabled'; COMMENT ON COLUMN "integrations"."isVerified" IS 'Is integration verified/trusted'; COMMENT ON COLUMN "integrations"."lastActivityAt" IS 'When integration was last active'; COMMENT ON COLUMN "integrations"."expiresAt" IS 'When credentials expire'; COMMENT ON COLUMN "integrations"."lastError" IS 'Last error message'; COMMENT ON COLUMN "integrations"."errorCount" IS 'Number of consecutive errors'; COMMENT ON COLUMN "integrations"."installedAt" IS 'When integration was installed'`);
        await queryRunner.query(`CREATE INDEX "IDX_integrations_type" ON "integrations" ("type") `);
        await queryRunner.query(`CREATE INDEX "IDX_integrations_status" ON "integrations" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_integrations_created_at" ON "integrations" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_integrations_external_id" ON "integrations" ("externalId") `);
        await queryRunner.query(`CREATE INDEX "IDX_integrations_workspace_user" ON "integrations" ("workspaceId", "userId") `);
        await queryRunner.query(`CREATE INDEX "IDX_integrations_workspace_status" ON "integrations" ("workspaceId", "status") `);
        await queryRunner.query(`CREATE INDEX "IDX_integrations_workspace_type" ON "integrations" ("workspaceId", "type") `);
        await queryRunner.query(`CREATE TABLE "integration_webhooks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "workspaceId" uuid NOT NULL, "url" character varying(255) NOT NULL, "event" character varying(100) NOT NULL, "status" character varying(20) NOT NULL DEFAULT 'active', "secret" character varying(255), "headers" jsonb, "failureCount" integer NOT NULL DEFAULT '0', "lastDeliveredAt" TIMESTAMP WITH TIME ZONE, "lastError" text, "integrationId" uuid NOT NULL, CONSTRAINT "PK_1e400939bc3644d4a5f19687350" PRIMARY KEY ("id")); COMMENT ON COLUMN "integration_webhooks"."createdAt" IS 'Record creation timestamp'; COMMENT ON COLUMN "integration_webhooks"."updatedAt" IS 'Record last update timestamp'; COMMENT ON COLUMN "integration_webhooks"."deletedAt" IS 'Soft delete timestamp'; COMMENT ON COLUMN "integration_webhooks"."workspaceId" IS 'Workspace ID for multi-tenancy'; COMMENT ON COLUMN "integration_webhooks"."url" IS 'Webhook URL endpoint'; COMMENT ON COLUMN "integration_webhooks"."event" IS 'Event type'; COMMENT ON COLUMN "integration_webhooks"."status" IS 'Webhook status'; COMMENT ON COLUMN "integration_webhooks"."secret" IS 'Webhook secret for verification'; COMMENT ON COLUMN "integration_webhooks"."headers" IS 'Webhook headers'; COMMENT ON COLUMN "integration_webhooks"."failureCount" IS 'Number of delivery failures'; COMMENT ON COLUMN "integration_webhooks"."lastDeliveredAt" IS 'Last successful delivery'; COMMENT ON COLUMN "integration_webhooks"."lastError" IS 'Last error message'`);
        await queryRunner.query(`CREATE INDEX "IDX_integration_webhooks_status" ON "integration_webhooks" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_integration_webhooks_event" ON "integration_webhooks" ("event") `);
        await queryRunner.query(`CREATE INDEX "IDX_integration_webhooks_integration" ON "integration_webhooks" ("integrationId") `);
        await queryRunner.query(`CREATE TABLE "integration_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "workspaceId" uuid NOT NULL, "level" character varying(20) NOT NULL, "message" character varying(255) NOT NULL, "data" jsonb, "action" character varying(100), "duration" integer, "integrationId" uuid NOT NULL, CONSTRAINT "PK_89ba1967bb4ac6c412901cf29a5" PRIMARY KEY ("id")); COMMENT ON COLUMN "integration_logs"."createdAt" IS 'Record creation timestamp'; COMMENT ON COLUMN "integration_logs"."updatedAt" IS 'Record last update timestamp'; COMMENT ON COLUMN "integration_logs"."deletedAt" IS 'Soft delete timestamp'; COMMENT ON COLUMN "integration_logs"."workspaceId" IS 'Workspace ID for multi-tenancy'; COMMENT ON COLUMN "integration_logs"."level" IS 'Log level'; COMMENT ON COLUMN "integration_logs"."message" IS 'Log message'; COMMENT ON COLUMN "integration_logs"."data" IS 'Additional log data'; COMMENT ON COLUMN "integration_logs"."action" IS 'Action or operation'; COMMENT ON COLUMN "integration_logs"."duration" IS 'Duration in milliseconds'`);
        await queryRunner.query(`CREATE INDEX "IDX_integration_logs_created_at" ON "integration_logs" ("createdAt") `);
        await queryRunner.query(`CREATE INDEX "IDX_integration_logs_level" ON "integration_logs" ("level") `);
        await queryRunner.query(`CREATE INDEX "IDX_integration_logs_integration" ON "integration_logs" ("integrationId") `);
        await queryRunner.query(`ALTER TABLE "integrations" ADD CONSTRAINT "FK_c32758a01d05d0d1da56fa46ae1" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "integration_webhooks" ADD CONSTRAINT "FK_a4a01659029f41390538cabea0c" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "integration_logs" ADD CONSTRAINT "FK_e9c3b9a7373afc11cdc18f2533f" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "integration_logs" DROP CONSTRAINT "FK_e9c3b9a7373afc11cdc18f2533f"`);
        await queryRunner.query(`ALTER TABLE "integration_webhooks" DROP CONSTRAINT "FK_a4a01659029f41390538cabea0c"`);
        await queryRunner.query(`ALTER TABLE "integrations" DROP CONSTRAINT "FK_c32758a01d05d0d1da56fa46ae1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_integration_logs_integration"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_integration_logs_level"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_integration_logs_created_at"`);
        await queryRunner.query(`DROP TABLE "integration_logs"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_integration_webhooks_integration"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_integration_webhooks_event"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_integration_webhooks_status"`);
        await queryRunner.query(`DROP TABLE "integration_webhooks"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_integrations_workspace_type"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_integrations_workspace_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_integrations_workspace_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_integrations_external_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_integrations_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_integrations_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_integrations_type"`);
        await queryRunner.query(`DROP TABLE "integrations"`);
        await queryRunner.query(`DROP TYPE "public"."integrations_authtype_enum"`);
        await queryRunner.query(`DROP TYPE "public"."integrations_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."integrations_type_enum"`);
    }

}
