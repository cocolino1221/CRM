import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The Google Calendar event id or Zoom meeting id behind a booking's link,
 * so cancelling the booking can also remove the meeting.
 */
export class AddBookingExternalMeetingId1792290000000 implements MigrationInterface {
  name = 'AddBookingExternalMeetingId1792290000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "bookings"
        ADD COLUMN IF NOT EXISTS "externalMeetingId" varchar(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN IF EXISTS "externalMeetingId"`);
  }
}
