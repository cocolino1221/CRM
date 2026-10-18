import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactPhoneNormalized1771804800000 implements MigrationInterface {
  name = 'AddContactPhoneNormalized1771804800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "phoneNormalized" character varying(20)`);

    await queryRunner.query(`
      UPDATE "contacts"
      SET "phoneNormalized" =
        CASE
          WHEN "phone" IS NULL OR btrim("phone") = '' THEN NULL
          WHEN "phone" LIKE '+%' THEN '+' || regexp_replace("phone", '[^0-9]', '', 'g')
          WHEN regexp_replace("phone", '[^0-9]', '', 'g') LIKE '00%' THEN '+' || substring(regexp_replace("phone", '[^0-9]', '', 'g') from 3)
          WHEN regexp_replace("phone", '[^0-9]', '', 'g') LIKE '40%' THEN '+' || regexp_replace("phone", '[^0-9]', '', 'g')
          WHEN regexp_replace("phone", '[^0-9]', '', 'g') LIKE '0%' THEN '+40' || substring(regexp_replace("phone", '[^0-9]', '', 'g') from 2)
          ELSE '+' || regexp_replace("phone", '[^0-9]', '', 'g')
        END
      WHERE "phone" IS NOT NULL
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_contacts_workspace_phone_normalized" ON "contacts" ("workspaceId", "phoneNormalized") `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_contacts_workspace_phone_normalized"`);
    await queryRunner.query(`ALTER TABLE "contacts" DROP COLUMN "phoneNormalized"`);
  }
}
