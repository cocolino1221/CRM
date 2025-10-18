import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateIndexesMigration1759246997913 implements MigrationInterface {
    name = 'CreateIndexesMigration1759246997913'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "isActive"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "deletedAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."deletedAt" IS 'Soft delete timestamp'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "workspaceId" uuid NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."workspaceId" IS 'Workspace ID for multi-tenancy'`);
        await queryRunner.query(`CREATE TYPE "public"."users_status_enum" AS ENUM('active', 'inactive', 'suspended', 'pending')`);
        await queryRunner.query(`ALTER TABLE "users" ADD "status" "public"."users_status_enum" NOT NULL DEFAULT 'active'`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."status" IS 'User account status'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "preferences" jsonb`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."preferences" IS 'User preferences and settings'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "lastLoginAt" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."lastLoginAt" IS 'Last login timestamp'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "failedLoginAttempts" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."failedLoginAttempts" IS 'Failed login attempts counter'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "lockedUntil" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."lockedUntil" IS 'Account locked until timestamp'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."createdAt" IS 'Record creation timestamp'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "updatedAt"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."updatedAt" IS 'Record last update timestamp'`);
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "email" character varying(255) NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."email" IS 'User email address'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "firstName"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "firstName" character varying(100) NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."firstName" IS 'User first name'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastName"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "lastName" character varying(100) NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."lastName" IS 'User last name'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "password" character varying(255) NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."password" IS 'Hashed password'`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."role" IS 'User role in workspace'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "slackUserId"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "slackUserId" character varying(50)`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."slackUserId" IS 'Slack user ID for integration'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "avatar" character varying(500)`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."avatar" IS 'User avatar URL'`);
        await queryRunner.query(`CREATE INDEX "IDX_users_email" ON "users" ("email") `);
        await queryRunner.query(`CREATE INDEX "IDX_users_role" ON "users" ("role") `);
        await queryRunner.query(`CREATE INDEX "IDX_users_status" ON "users" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_users_workspace_status" ON "users" ("workspaceId", "status") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_users_workspace_email" ON "users" ("workspaceId", "email") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_users_workspace_email"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_users_workspace_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_users_status"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_users_role"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_users_email"`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."avatar" IS 'User avatar URL'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "avatar"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "avatar" character varying`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."slackUserId" IS 'Slack user ID for integration'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "slackUserId"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "slackUserId" character varying`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."role" IS NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."password" IS 'Hashed password'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "password"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "password" character varying NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."lastName" IS 'User last name'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastName"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "lastName" character varying NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."firstName" IS 'User first name'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "firstName"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "firstName" character varying NOT NULL`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."email" IS 'User email address'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "email"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "email" character varying NOT NULL`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."updatedAt" IS 'Record last update timestamp'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "updatedAt"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "updatedAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."createdAt" IS 'Record creation timestamp'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "createdAt"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."lockedUntil" IS 'Account locked until timestamp'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lockedUntil"`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."failedLoginAttempts" IS 'Failed login attempts counter'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "failedLoginAttempts"`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."lastLoginAt" IS 'Last login timestamp'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastLoginAt"`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."preferences" IS 'User preferences and settings'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "preferences"`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."status" IS 'User account status'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."users_status_enum"`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."workspaceId" IS 'Workspace ID for multi-tenancy'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "workspaceId"`);
        await queryRunner.query(`COMMENT ON COLUMN "users"."deletedAt" IS 'Soft delete timestamp'`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deletedAt"`);
        await queryRunner.query(`ALTER TABLE "users" ADD "isActive" boolean NOT NULL DEFAULT true`);
    }

}
