import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixContactsPipelineId1761777600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Update all contacts that have a pipelineStageId but no pipelineId
    await queryRunner.query(`
      UPDATE contacts
      SET "pipelineId" = (
        SELECT "pipelineId"
        FROM pipeline_stages
        WHERE pipeline_stages.id = contacts."pipelineStageId"
      )
      WHERE "pipelineStageId" IS NOT NULL AND "pipelineId" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // No need to revert this data fix
  }
}
