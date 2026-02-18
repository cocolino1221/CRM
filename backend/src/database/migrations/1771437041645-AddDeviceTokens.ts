import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDeviceTokens1771437041645 implements MigrationInterface {
    name = 'AddDeviceTokens1771437041645'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."device_tokens_platform_enum" AS ENUM('ios', 'android', 'web')`);
        await queryRunner.query(`CREATE TABLE "device_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "workspaceId" uuid NOT NULL, "userId" uuid NOT NULL, "token" character varying(500) NOT NULL, "platform" "public"."device_tokens_platform_enum" NOT NULL, "isActive" boolean NOT NULL DEFAULT true, CONSTRAINT "PK_84700be257607cfb1f9dc2e52c3" PRIMARY KEY ("id")); COMMENT ON COLUMN "device_tokens"."createdAt" IS 'Record creation timestamp'; COMMENT ON COLUMN "device_tokens"."updatedAt" IS 'Record last update timestamp'; COMMENT ON COLUMN "device_tokens"."deletedAt" IS 'Soft delete timestamp'; COMMENT ON COLUMN "device_tokens"."workspaceId" IS 'Workspace ID for multi-tenancy'`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_device_tokens_token" ON "device_tokens" ("token") `);
        await queryRunner.query(`CREATE INDEX "IDX_device_tokens_user" ON "device_tokens" ("userId") `);
        await queryRunner.query(`ALTER TABLE "device_tokens" ADD CONSTRAINT "FK_511957e3e8443429dc3fb00120c" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "device_tokens" DROP CONSTRAINT "FK_511957e3e8443429dc3fb00120c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_device_tokens_user"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_device_tokens_token"`);
        await queryRunner.query(`DROP TABLE "device_tokens"`);
        await queryRunner.query(`DROP TYPE "public"."device_tokens_platform_enum"`);
    }

}
