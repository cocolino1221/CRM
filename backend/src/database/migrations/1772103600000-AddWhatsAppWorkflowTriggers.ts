import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWhatsAppWorkflowTriggers1772103600000 implements MigrationInterface {
  name = 'AddWhatsAppWorkflowTriggers1772103600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "public"."workflows_triggertype_enum" ADD VALUE IF NOT EXISTS 'whatsapp.message.received';
      EXCEPTION
        WHEN undefined_object THEN null;
      END $$;
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TYPE "public"."workflows_triggertype_enum" ADD VALUE IF NOT EXISTS 'whatsapp.button.clicked';
      EXCEPTION
        WHEN undefined_object THEN null;
      END $$;
    `);
  }

  public async down(_queryRunner: QueryRunner): Promise<void> {
    // No-op: PostgreSQL enum values cannot be removed safely in place.
  }
}

