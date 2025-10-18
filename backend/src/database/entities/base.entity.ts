import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  Column,
  Index,
  BeforeInsert,
  BeforeUpdate,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { v4 as uuidv4 } from 'uuid';

/**
 * Base entity with common fields for all entities
 * Includes soft deletes, timestamps, and audit information
 */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @CreateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    comment: 'Record creation timestamp',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
    comment: 'Record last update timestamp',
  })
  updatedAt: Date;

  @DeleteDateColumn({
    type: 'timestamptz',
    nullable: true,
    comment: 'Soft delete timestamp',
  })
  @Exclude()
  deletedAt?: Date;

  @BeforeInsert()
  generateId() {
    if (!this.id) {
      this.id = uuidv4();
    }
  }

  @BeforeUpdate()
  updateTimestamp() {
    this.updatedAt = new Date();
  }
}

/**
 * Base entity for workspace-scoped resources
 */
export abstract class WorkspaceEntity extends BaseEntity {
  @Column('uuid', {
    comment: 'Workspace ID for multi-tenancy',
  })
  workspaceId: string;
}