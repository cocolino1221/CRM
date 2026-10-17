import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayflowContactSource1787400000000 implements MigrationInterface {
  name = 'AddPayflowContactSource1787400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TYPE "public"."contacts_source_enum" ADD VALUE IF NOT EXISTS 'payflow'
    `);
  }

  public async down(): Promise<void> {
    // Postgres has no DROP VALUE for enums; the unused value is harmless.
  }
}
