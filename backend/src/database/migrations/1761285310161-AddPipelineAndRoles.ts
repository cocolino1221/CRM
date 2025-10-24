import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPipelineAndRoles1761285310161 implements MigrationInterface {
    name = 'AddPipelineAndRoles1761285310161'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "pipeline_stages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "workspaceId" uuid NOT NULL, "name" character varying(100) NOT NULL, "description" text, "displayOrder" integer NOT NULL DEFAULT '0', "color" character varying(7) NOT NULL DEFAULT '#3B82F6', "isClosedWon" boolean NOT NULL DEFAULT false, "isClosedLost" boolean NOT NULL DEFAULT false, "config" jsonb, "pipelineId" uuid NOT NULL, CONSTRAINT "PK_92e43270eace072ad5182fc08e2" PRIMARY KEY ("id")); COMMENT ON COLUMN "pipeline_stages"."createdAt" IS 'Record creation timestamp'; COMMENT ON COLUMN "pipeline_stages"."updatedAt" IS 'Record last update timestamp'; COMMENT ON COLUMN "pipeline_stages"."deletedAt" IS 'Soft delete timestamp'; COMMENT ON COLUMN "pipeline_stages"."workspaceId" IS 'Workspace ID for multi-tenancy'; COMMENT ON COLUMN "pipeline_stages"."name" IS 'Stage name'; COMMENT ON COLUMN "pipeline_stages"."description" IS 'Stage description'; COMMENT ON COLUMN "pipeline_stages"."displayOrder" IS 'Display order in pipeline'; COMMENT ON COLUMN "pipeline_stages"."color" IS 'Stage color (hex code)'; COMMENT ON COLUMN "pipeline_stages"."isClosedWon" IS 'Is this a closed/won stage'; COMMENT ON COLUMN "pipeline_stages"."isClosedLost" IS 'Is this a closed/lost stage'; COMMENT ON COLUMN "pipeline_stages"."config" IS 'Stage configuration and settings'`);
        await queryRunner.query(`CREATE INDEX "IDX_pipeline_stages_order" ON "pipeline_stages" ("pipelineId", "displayOrder") `);
        await queryRunner.query(`CREATE INDEX "IDX_pipeline_stages_pipeline" ON "pipeline_stages" ("pipelineId") `);
        await queryRunner.query(`CREATE TABLE "pipelines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "workspaceId" uuid NOT NULL, "name" character varying(100) NOT NULL, "description" text, "isDefault" boolean NOT NULL DEFAULT false, "isActive" boolean NOT NULL DEFAULT true, "displayOrder" integer NOT NULL DEFAULT '0', "config" jsonb, CONSTRAINT "PK_e38ea171cdfad107c1f3db2c036" PRIMARY KEY ("id")); COMMENT ON COLUMN "pipelines"."createdAt" IS 'Record creation timestamp'; COMMENT ON COLUMN "pipelines"."updatedAt" IS 'Record last update timestamp'; COMMENT ON COLUMN "pipelines"."deletedAt" IS 'Soft delete timestamp'; COMMENT ON COLUMN "pipelines"."workspaceId" IS 'Workspace ID for multi-tenancy'; COMMENT ON COLUMN "pipelines"."name" IS 'Pipeline name'; COMMENT ON COLUMN "pipelines"."description" IS 'Pipeline description'; COMMENT ON COLUMN "pipelines"."isDefault" IS 'Is this the default pipeline for new leads'; COMMENT ON COLUMN "pipelines"."isActive" IS 'Is this pipeline active'; COMMENT ON COLUMN "pipelines"."displayOrder" IS 'Display order'; COMMENT ON COLUMN "pipelines"."config" IS 'Pipeline configuration and settings'`);
        await queryRunner.query(`CREATE INDEX "IDX_pipelines_is_default" ON "pipelines" ("workspaceId", "isDefault") `);
        await queryRunner.query(`CREATE INDEX "IDX_pipelines_workspace" ON "pipelines" ("workspaceId") `);
        await queryRunner.query(`ALTER TABLE "contacts" ADD "pipelineId" uuid`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD "pipelineStageId" uuid`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD "setterId" uuid`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD "callerId" uuid`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD "closerId" uuid`);
        await queryRunner.query(`ALTER TYPE "public"."users_role_enum" RENAME TO "users_role_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum" AS ENUM('admin', 'manager', 'closer', 'setter', 'caller', 'sales_rep', 'support_agent')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING "role"::"text"::"public"."users_role_enum"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'sales_rep'`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum_old"`);
        await queryRunner.query(`ALTER TABLE "pipeline_stages" ADD CONSTRAINT "FK_baf88297801e6ecdc298eafb940" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD CONSTRAINT "FK_a7060fd7f495ad441095de9617e" FOREIGN KEY ("pipelineId") REFERENCES "pipelines"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD CONSTRAINT "FK_4e630777b7c2b63c7a375bddd0f" FOREIGN KEY ("pipelineStageId") REFERENCES "pipeline_stages"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD CONSTRAINT "FK_366f58718c9ebb8c00eeb1ef6f7" FOREIGN KEY ("setterId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD CONSTRAINT "FK_6dade2c2986cf22c3f4bb19dc4b" FOREIGN KEY ("callerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "contacts" ADD CONSTRAINT "FK_9dd47d9f72eccb8d61bd38fed1a" FOREIGN KEY ("closerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contacts" DROP CONSTRAINT "FK_9dd47d9f72eccb8d61bd38fed1a"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP CONSTRAINT "FK_6dade2c2986cf22c3f4bb19dc4b"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP CONSTRAINT "FK_366f58718c9ebb8c00eeb1ef6f7"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP CONSTRAINT "FK_4e630777b7c2b63c7a375bddd0f"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP CONSTRAINT "FK_a7060fd7f495ad441095de9617e"`);
        await queryRunner.query(`ALTER TABLE "pipeline_stages" DROP CONSTRAINT "FK_baf88297801e6ecdc298eafb940"`);
        await queryRunner.query(`CREATE TYPE "public"."users_role_enum_old" AS ENUM('admin', 'manager', 'closer', 'setter', 'sales_rep', 'support_agent')`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum_old" USING "role"::"text"::"public"."users_role_enum_old"`);
        await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'sales_rep'`);
        await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."users_role_enum_old" RENAME TO "users_role_enum"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "closerId"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "callerId"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "setterId"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "pipelineStageId"`);
        await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "pipelineId"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_pipelines_workspace"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_pipelines_is_default"`);
        await queryRunner.query(`DROP TABLE "pipelines"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_pipeline_stages_pipeline"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_pipeline_stages_order"`);
        await queryRunner.query(`DROP TABLE "pipeline_stages"`);
    }

}
