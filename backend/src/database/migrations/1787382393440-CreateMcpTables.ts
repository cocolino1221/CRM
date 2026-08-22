import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateMcpTables1787382393440 implements MigrationInterface {
    name = 'CreateMcpTables1787382393440'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "mcp_tool_invocations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" character varying NOT NULL, "userId" character varying NOT NULL, "toolName" character varying NOT NULL, "args" jsonb, "status" character varying NOT NULL, "error" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ea41fec57d8d573f72412ede254" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_23fb122dc58e0da707df54cffb" ON "mcp_tool_invocations" ("workspaceId") `);
        await queryRunner.query(`CREATE INDEX "IDX_b0f020c7dc9c78fec5da082d7a" ON "mcp_tool_invocations" ("toolName") `);
        await queryRunner.query(`CREATE TABLE "mcp_refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "jti" character varying NOT NULL, "grantId" character varying NOT NULL, "workspaceId" character varying NOT NULL, "userId" character varying NOT NULL, "scopes" jsonb NOT NULL, "revoked" boolean NOT NULL DEFAULT false, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_74733a443c784a1cb13c552c936" UNIQUE ("jti"), CONSTRAINT "PK_0a56ff19b7fe48d4fa2ac7fd80c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_74733a443c784a1cb13c552c93" ON "mcp_refresh_tokens" ("jti") `);
        await queryRunner.query(`CREATE TABLE "mcp_oauth_clients" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "clientId" character varying NOT NULL, "redirectUris" jsonb NOT NULL, "clientName" character varying NOT NULL, "clientUri" text, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_92218d4d768e63d0a927e1b4d7f" UNIQUE ("clientId"), CONSTRAINT "PK_4181797e92d4045538474d89379" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_92218d4d768e63d0a927e1b4d7" ON "mcp_oauth_clients" ("clientId") `);
        await queryRunner.query(`CREATE TABLE "mcp_oauth_grants" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "workspaceId" character varying NOT NULL, "userId" character varying NOT NULL, "clientId" character varying NOT NULL, "clientName" character varying NOT NULL, "scopes" jsonb NOT NULL, "revoked" boolean NOT NULL DEFAULT false, "lastUsedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7c386b8092dbba5748e817873ed" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_625b4d4bfd39a28f466027a03d" ON "mcp_oauth_grants" ("workspaceId", "userId", "clientId") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_625b4d4bfd39a28f466027a03d"`);
        await queryRunner.query(`DROP TABLE "mcp_oauth_grants"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_92218d4d768e63d0a927e1b4d7"`);
        await queryRunner.query(`DROP TABLE "mcp_oauth_clients"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_74733a443c784a1cb13c552c93"`);
        await queryRunner.query(`DROP TABLE "mcp_refresh_tokens"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b0f020c7dc9c78fec5da082d7a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_23fb122dc58e0da707df54cffb"`);
        await queryRunner.query(`DROP TABLE "mcp_tool_invocations"`);
    }

}
