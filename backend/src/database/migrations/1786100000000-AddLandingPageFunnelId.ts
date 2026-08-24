import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLandingPageFunnelId1786100000000 implements MigrationInterface {
  name = 'AddLandingPageFunnelId1786100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "landing_pages" ADD COLUMN IF NOT EXISTS "funnelId" uuid
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "landing_pages"
          ADD CONSTRAINT "FK_landing_pages_funnel"
          FOREIGN KEY ("funnelId") REFERENCES "funnels"("id") ON DELETE SET NULL;
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "landing_pages" DROP CONSTRAINT IF EXISTS "FK_landing_pages_funnel"`);
    await queryRunner.query(`ALTER TABLE "landing_pages" DROP COLUMN IF EXISTS "funnelId"`);
  }
}
