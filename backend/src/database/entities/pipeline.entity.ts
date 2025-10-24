import {
  Entity,
  Column,
  OneToMany,
  Index,
} from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { PipelineStage } from './pipeline-stage.entity';
import { Contact } from './contact.entity';

@Entity('pipelines')
@Index('IDX_pipelines_workspace', ['workspaceId'])
@Index('IDX_pipelines_is_default', ['workspaceId', 'isDefault'])
export class Pipeline extends WorkspaceEntity {
  @Column({
    type: 'varchar',
    length: 100,
    comment: 'Pipeline name',
  })
  name: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Pipeline description',
  })
  description?: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Is this the default pipeline for new leads',
  })
  isDefault: boolean;

  @Column({
    type: 'boolean',
    default: true,
    comment: 'Is this pipeline active',
  })
  isActive: boolean;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Display order',
  })
  displayOrder: number;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Pipeline configuration and settings',
  })
  config?: Record<string, any>;

  // Relationships
  @OneToMany(() => PipelineStage, (stage) => stage.pipeline, {
    cascade: true,
  })
  stages: PipelineStage[];

  @OneToMany(() => Contact, (contact) => contact.pipeline)
  contacts: Contact[];
}
