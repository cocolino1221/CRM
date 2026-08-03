import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactPreluat1785400000000 implements MigrationInterface {
  name = 'AddContactPreluat1785400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "preluat" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contacts" DROP COLUMN IF EXISTS "preluat"
    `);
  }
}
