import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * How often a closer's day is cut into bookable start times.
 *
 * It was a hard-coded 15 minutes; a closer who works in half-hours now gets
 * 09:00, 09:30 instead of 09:00, 09:15, 09:30.
 */
export class AddMeetingTypeSlotInterval1792280000000 implements MigrationInterface {
  name = 'AddMeetingTypeSlotInterval1792280000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "meeting_types"
        ADD COLUMN IF NOT EXISTS "slotInterval" integer NOT NULL DEFAULT 15
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "meeting_types" DROP COLUMN IF EXISTS "slotInterval"`);
  }
}
