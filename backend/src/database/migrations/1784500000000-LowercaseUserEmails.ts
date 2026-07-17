import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin-created users could be stored with mixed-case emails (CreateUserDto
 * had no lowercase transform), while login lowercases the email before
 * lookup — making those accounts impossible to sign into and invisible to
 * forgot-password. Normalize all existing emails to lowercase.
 *
 * Rows whose lowered email would collide with another user in the same
 * workspace (unique index on workspaceId+email) are left untouched.
 */
export class LowercaseUserEmails1784500000000 implements MigrationInterface {
  name = 'LowercaseUserEmails1784500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users" u
      SET "email" = LOWER(u."email")
      WHERE u."email" <> LOWER(u."email")
        AND NOT EXISTS (
          SELECT 1 FROM "users" v
          WHERE v."workspaceId" = u."workspaceId"
            AND v."email" = LOWER(u."email")
            AND v."id" <> u."id"
        )
    `);
  }

  public async down(): Promise<void> {
    // Original casing is not recoverable; lowercase emails are the desired
    // canonical form, so down() is a no-op.
  }
}
