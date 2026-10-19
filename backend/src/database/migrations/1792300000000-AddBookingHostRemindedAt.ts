import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Marks that the closer was already reminded of a booking, so the five-minute
 * reminder run does not push the same meeting twice. Cleared when the booking
 * moves, so the new time gets its own reminder.
 */
export class AddBookingHostRemindedAt1792300000000 implements MigrationInterface {
  name = 'AddBookingHostRemindedAt1792300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "hostRemindedAt" TIMESTAMP WITH TIME ZONE`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "hostRemindedAt"`);
  }
}
