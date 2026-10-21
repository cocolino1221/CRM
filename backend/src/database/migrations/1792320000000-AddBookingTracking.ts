import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Where someone who booked came from — the utm_* on the link they opened and
 * the page that sent them — so bookings can be counted per channel.
 */
export class AddBookingTracking1792320000000 implements MigrationInterface {
  name = 'AddBookingTracking1792320000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bookings"
        ADD COLUMN IF NOT EXISTS "tracking" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "tracking"`);
  }
}
