import { MigrationInterface, QueryRunner } from "typeorm";

export class AddWorkspaceInviteCode1771200000000 implements MigrationInterface {
    name = 'AddWorkspaceInviteCode1771200000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workspaces" ADD "inviteCode" character varying(20)`);
        await queryRunner.query(`ALTER TABLE "workspaces" ADD CONSTRAINT "UQ_workspaces_inviteCode" UNIQUE ("inviteCode")`);

        // Generate invite codes for existing workspaces
        const workspaces = await queryRunner.query(`SELECT id FROM "workspaces" WHERE "inviteCode" IS NULL`);
        for (const ws of workspaces) {
            const code = Array.from({ length: 8 }, () =>
                '0123456789ABCDEF'[Math.floor(Math.random() * 16)]
            ).join('');
            await queryRunner.query(`UPDATE "workspaces" SET "inviteCode" = $1 WHERE id = $2`, [code, ws.id]);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "workspaces" DROP CONSTRAINT "UQ_workspaces_inviteCode"`);
        await queryRunner.query(`ALTER TABLE "workspaces" DROP COLUMN "inviteCode"`);
    }
}
