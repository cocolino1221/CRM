import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Two things a call outcome saved but nothing showed.
 *
 * The note went to followUpNotes only, while the lead's history shows the
 * activity description — so callers saw empty calls and thought Salvează did
 * nothing. And the person who called was never put on the lead, which stayed
 * "Closer/Caller: Neasignat". Both are fixed for new calls in
 * ActivitiesService; this brings the calls already logged into line.
 *
 * Only empty fields are filled: an existing description or assignment is
 * never overwritten, so running it twice changes nothing.
 */
export class BackfillCallNotesAndAssignees1792310000000 implements MigrationInterface {
  name = 'BackfillCallNotesAndAssignees1792310000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE activities
         SET description = "followUpNotes"
       WHERE type = 'call'
         AND metadata ? 'dispositionRequestId'
         AND COALESCE(description, '') = ''
         AND COALESCE(TRIM("followUpNotes"), '') <> ''
    `);

    // The latest call each person logged on a lead, closers first.
    await queryRunner.query(`
      UPDATE contacts c
         SET "closerId" = x."userId"
        FROM (
          SELECT DISTINCT ON (a."contactId") a."contactId", a."userId"
            FROM activities a
            JOIN users u ON u.id = a."userId"
           WHERE a.type = 'call' AND a.metadata ? 'dispositionRequestId'
             AND a."deletedAt" IS NULL AND u.role::text = 'closer'
           ORDER BY a."contactId", a."createdAt" DESC
        ) x
       WHERE c.id = x."contactId" AND c."closerId" IS NULL
    `);

    await queryRunner.query(`
      UPDATE contacts c
         SET "callerId" = x."userId"
        FROM (
          SELECT DISTINCT ON (a."contactId") a."contactId", a."userId"
            FROM activities a
            JOIN users u ON u.id = a."userId"
           WHERE a.type = 'call' AND a.metadata ? 'dispositionRequestId'
             AND a."deletedAt" IS NULL AND u.role::text IN ('caller', 'setter')
           ORDER BY a."contactId", a."createdAt" DESC
        ) x
       WHERE c.id = x."contactId" AND c."callerId" IS NULL
    `);
  }

  public async down(): Promise<void> {
    // Filling empty fields is not reversible without knowing which were
    // empty; there is nothing to undo that would not lose data.
  }
}
