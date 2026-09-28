import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWooCommerceContactSource1786600000000 implements MigrationInterface {
  name = 'AddWooCommerceContactSource1786600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."contacts_source_enum" ADD VALUE IF NOT EXISTS 'woocommerce'
    `);
  }

  public async down(): Promise<void> {
    // Postgres has no DROP VALUE for enums; the unused value is harmless.
  }
}
