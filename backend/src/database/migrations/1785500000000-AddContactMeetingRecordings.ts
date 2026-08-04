import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactMeetingRecordings1785500000000 implements MigrationInterface {
  name = 'AddContactMeetingRecordings1785500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contacts" ADD COLUMN IF NOT EXISTS "meetingRecordings" jsonb
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "contacts" DROP COLUMN IF EXISTS "meetingRecordings"
    `);
  }
}
