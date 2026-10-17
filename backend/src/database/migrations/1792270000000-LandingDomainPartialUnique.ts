import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Only a verified domain may block a hostname.
 *
 * The table-wide UNIQUE(hostname) from the previous migration meant a
 * workspace could type a competitor's domain, never prove ownership, and hold
 * it forever. Several workspaces may now have a pending claim on the same
 * hostname; only the one that can publish the token into DNS wins, and
 * verification clears the others.
 */
export class LandingDomainPartialUnique1792270000000 implements MigrationInterface {
  name = 'LandingDomainPartialUnique1792270000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "landing_domains"
        DROP CONSTRAINT IF EXISTS "UQ_landing_domains_hostname"
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_landing_domains_hostname_active"
        ON "landing_domains" ("hostname")
        WHERE "status" = 'active' AND "deletedAt" IS NULL
    `);
    // A workspace still cannot hold the same hostname twice.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "UQ_landing_domains_workspace_hostname"
        ON "landing_domains" ("workspaceId", "hostname")
        WHERE "deletedAt" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_landing_domains_workspace_hostname"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "UQ_landing_domains_hostname_active"`);
    await queryRunner.query(`
      ALTER TABLE "landing_domains"
        ADD CONSTRAINT "UQ_landing_domains_hostname" UNIQUE ("hostname")
    `);
  }
}
