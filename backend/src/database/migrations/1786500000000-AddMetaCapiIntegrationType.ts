import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetaCapiIntegrationType1786500000000 implements MigrationInterface {
  name = 'AddMetaCapiIntegrationType1786500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."integrations_type_enum" ADD VALUE IF NOT EXISTS 'meta_capi'
    `);
  }

  public async down(): Promise<void> {
    // Postgres has no DROP VALUE for enums — a value once added stays.
    // No-op; the extra enum value is harmless if unused.
  }
}
