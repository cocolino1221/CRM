import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWhatsAppIntegration1762323383460 implements MigrationInterface {
    name = 'AddWhatsAppIntegration1762323383460'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_integrations_workspace_type"`);

        // Check if the enum already has whatsapp
        const enumValues = await queryRunner.query(`
            SELECT e.enumlabel
            FROM pg_enum e
            JOIN pg_type t ON e.enumtypid = t.oid
            WHERE t.typname = 'integrations_type_enum';
        `);

        const labels = enumValues.map((v: any) => v.enumlabel);

        if (!labels.includes('whatsapp')) {
            // Need to update the enum
            await queryRunner.query(`ALTER TYPE "public"."integrations_type_enum" RENAME TO "integrations_type_enum_old"`);
            await queryRunner.query(`CREATE TYPE "public"."integrations_type_enum" AS ENUM('slack', 'google', 'microsoft', 'salesforce', 'hubspot', 'pipedrive', 'zoom', 'typeform', 'pandadoc', 'docusign', 'calendly', 'whatsapp', 'calendar', 'email', 'sms', 'social_media', 'webhook', 'api', 'database', 'custom')`);
            await queryRunner.query(`ALTER TABLE "integrations" ALTER COLUMN "type" TYPE "public"."integrations_type_enum" USING "type"::"text"::"public"."integrations_type_enum"`);
            await queryRunner.query(`DROP TYPE "public"."integrations_type_enum_old"`);
        }

        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_integrations_workspace_type" ON "integrations" ("workspaceId", "type") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_integrations_workspace_type"`);
        await queryRunner.query(`CREATE TYPE "public"."integrations_type_enum_old" AS ENUM('slack', 'google', 'microsoft', 'salesforce', 'hubspot', 'pipedrive', 'zoom', 'typeform', 'pandadoc', 'docusign', 'calendar', 'email', 'sms', 'social_media', 'webhook', 'api', 'database', 'custom')`);
        await queryRunner.query(`ALTER TABLE "integrations" ALTER COLUMN "type" TYPE "public"."integrations_type_enum_old" USING "type"::"text"::"public"."integrations_type_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."integrations_type_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."integrations_type_enum_old" RENAME TO "integrations_type_enum"`);
        await queryRunner.query(`CREATE INDEX "IDX_integrations_workspace_type" ON "integrations" ("type", "workspaceId") `);
    }

}
