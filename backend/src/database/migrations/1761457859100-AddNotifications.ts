import { MigrationInterface, QueryRunner } from "typeorm";

export class AddNotifications1761457859100 implements MigrationInterface {
    name = 'AddNotifications1761457859100'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."notifications_type_enum" AS ENUM('lead', 'task', 'email', 'call', 'meeting', 'system')`);
        await queryRunner.query(`CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "deletedAt" TIMESTAMP WITH TIME ZONE, "workspaceId" uuid NOT NULL, "type" "public"."notifications_type_enum" NOT NULL, "title" character varying(255) NOT NULL, "message" text NOT NULL, "isRead" boolean NOT NULL DEFAULT false, "link" character varying(500), "userId" uuid NOT NULL, "metadata" jsonb, CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id")); COMMENT ON COLUMN "notifications"."createdAt" IS 'Record creation timestamp'; COMMENT ON COLUMN "notifications"."updatedAt" IS 'Record last update timestamp'; COMMENT ON COLUMN "notifications"."deletedAt" IS 'Soft delete timestamp'; COMMENT ON COLUMN "notifications"."workspaceId" IS 'Workspace ID for multi-tenancy'; COMMENT ON COLUMN "notifications"."type" IS 'Type of notification'; COMMENT ON COLUMN "notifications"."title" IS 'Notification title'; COMMENT ON COLUMN "notifications"."message" IS 'Notification message'; COMMENT ON COLUMN "notifications"."isRead" IS 'Read status'; COMMENT ON COLUMN "notifications"."link" IS 'Optional link'; COMMENT ON COLUMN "notifications"."userId" IS 'User ID'; COMMENT ON COLUMN "notifications"."metadata" IS 'Additional metadata'`);
        await queryRunner.query(`ALTER TABLE "notifications" ADD CONSTRAINT "FK_692a909ee0fa9383e7859f9b406" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notifications" DROP CONSTRAINT "FK_692a909ee0fa9383e7859f9b406"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
        await queryRunner.query(`DROP TYPE "public"."notifications_type_enum"`);
    }

}
