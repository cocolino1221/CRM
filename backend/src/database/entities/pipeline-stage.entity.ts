import {
  Entity,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { WorkspaceEntity } from './base.entity';
import { Pipeline } from './pipeline.entity';
import { Contact } from './contact.entity';

@Entity('pipeline_stages')
@Index('IDX_pipeline_stages_pipeline', ['pipelineId'])
@Index('IDX_pipeline_stages_order', ['pipelineId', 'displayOrder'])
export class PipelineStage extends WorkspaceEntity {
  @Column({
    type: 'varchar',
    length: 100,
    comment: 'Stage name',
  })
  name: string;

  @Column({
    type: 'text',
    nullable: true,
    comment: 'Stage description',
  })
  description?: string;

  @Column({
    type: 'int',
    default: 0,
    comment: 'Display order in pipeline',
  })
  displayOrder: number;

  @Column({
    type: 'varchar',
    length: 7,
    default: '#3B82F6',
    comment: 'Stage color (hex code)',
  })
  color: string;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Is this a closed/won stage',
  })
  isClosedWon: boolean;

  @Column({
    type: 'boolean',
    default: false,
    comment: 'Is this a closed/lost stage',
  })
  isClosedLost: boolean;

  @Column({
    type: 'jsonb',
    nullable: true,
    comment: 'Stage configuration and settings',
  })
  config?: Record<string, any>;

  // Relationships
  @Column('uuid')
  pipelineId: string;

  @ManyToOne(() => Pipeline, (pipeline) => pipeline.stages, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'pipelineId' })
  pipeline: Pipeline;

  @OneToMany(() => Contact, (contact) => contact.pipelineStage)
  contacts: Contact[];
}
