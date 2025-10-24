import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Pipeline } from '../database/entities/pipeline.entity';
import { PipelineStage } from '../database/entities/pipeline-stage.entity';
import { Contact } from '../database/entities/contact.entity';
import { User } from '../database/entities/user.entity';
import { CreatePipelineDto } from './dto/create-pipeline.dto';
import { UpdateContactPipelineDto } from './dto/update-contact-pipeline.dto';

@Injectable()
export class PipelineService {
  constructor(
    @InjectRepository(Pipeline)
    private readonly pipelineRepository: Repository<Pipeline>,
    @InjectRepository(PipelineStage)
    private readonly pipelineStageRepository: Repository<PipelineStage>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  // ========== Pipeline Management ==========

  async createPipeline(workspaceId: string, dto: CreatePipelineDto) {
    // If this is set as default, unset other defaults
    if (dto.isDefault) {
      await this.pipelineRepository.update(
        { workspaceId, isDefault: true },
        { isDefault: false },
      );
    }

    const pipeline = this.pipelineRepository.create({
      ...dto,
      workspaceId,
      displayOrder: await this.getNextDisplayOrder(workspaceId),
    });

    const savedPipeline = await this.pipelineRepository.save(pipeline);

    // Create stages if provided
    if (dto.stages && dto.stages.length > 0) {
      const stages = dto.stages.map((stageDto, index) =>
        this.pipelineStageRepository.create({
          ...stageDto,
          workspaceId,
          pipelineId: savedPipeline.id,
          displayOrder: stageDto.displayOrder ?? index,
        }),
      );
      await this.pipelineStageRepository.save(stages);
    } else {
      // Create default stages
      await this.createDefaultStages(workspaceId, savedPipeline.id);
    }

    return this.getPipelineById(workspaceId, savedPipeline.id);
  }

  async getPipelines(workspaceId: string) {
    return this.pipelineRepository.find({
      where: { workspaceId, deletedAt: null as any },
      relations: ['stages'],
      order: {
        displayOrder: 'ASC',
        stages: { displayOrder: 'ASC' },
      },
    });
  }

  async getPipelineById(workspaceId: string, id: string) {
    const pipeline = await this.pipelineRepository.findOne({
      where: { id, workspaceId, deletedAt: null as any },
      relations: ['stages'],
      order: { stages: { displayOrder: 'ASC' } },
    });

    if (!pipeline) {
      throw new NotFoundException('Pipeline not found');
    }

    return pipeline;
  }

  async updatePipeline(
    workspaceId: string,
    id: string,
    dto: Partial<CreatePipelineDto>,
  ) {
    const pipeline = await this.getPipelineById(workspaceId, id);

    // If setting as default, unset other defaults
    if (dto.isDefault) {
      await this.pipelineRepository
        .createQueryBuilder()
        .update(Pipeline)
        .set({ isDefault: false })
        .where('workspaceId = :workspaceId', { workspaceId })
        .andWhere('isDefault = :isDefault', { isDefault: true })
        .andWhere('id != :id', { id })
        .execute();
    }

    Object.assign(pipeline, dto);
    return this.pipelineRepository.save(pipeline);
  }

  async deletePipeline(workspaceId: string, id: string) {
    const pipeline = await this.getPipelineById(workspaceId, id);

    // Check if there are contacts in this pipeline
    const contactCount = await this.contactRepository.count({
      where: { workspaceId, pipelineId: id, deletedAt: null as any },
    });

    if (contactCount > 0) {
      throw new BadRequestException(
        `Cannot delete pipeline with ${contactCount} contacts. Please move contacts to another pipeline first.`,
      );
    }

    await this.pipelineRepository.softDelete({ id, workspaceId });
  }

  // ========== Stage Management ==========

  async createStage(workspaceId: string, pipelineId: string, dto: any) {
    const pipeline = await this.getPipelineById(workspaceId, pipelineId);

    const stage = this.pipelineStageRepository.create({
      ...dto,
      workspaceId,
      pipelineId: pipeline.id,
      displayOrder: dto.displayOrder ?? (await this.getNextStageOrder(pipelineId)),
    });

    return this.pipelineStageRepository.save(stage);
  }

  async updateStage(workspaceId: string, id: string, dto: any) {
    const stage = await this.pipelineStageRepository.findOne({
      where: { id, workspaceId, deletedAt: null as any },
    });

    if (!stage) {
      throw new NotFoundException('Pipeline stage not found');
    }

    Object.assign(stage, dto);
    return this.pipelineStageRepository.save(stage);
  }

  async deleteStage(workspaceId: string, id: string) {
    const contactCount = await this.contactRepository.count({
      where: { workspaceId, pipelineStageId: id, deletedAt: null as any },
    });

    if (contactCount > 0) {
      throw new BadRequestException(
        `Cannot delete stage with ${contactCount} contacts. Please move contacts to another stage first.`,
      );
    }

    await this.pipelineStageRepository.softDelete({ id, workspaceId });
  }

  // ========== Contact Pipeline Management ==========

  async updateContactPipeline(
    workspaceId: string,
    contactId: string,
    dto: UpdateContactPipelineDto,
  ) {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, workspaceId, deletedAt: null as any },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    // Validate pipeline and stage
    if (dto.pipelineId) {
      await this.getPipelineById(workspaceId, dto.pipelineId);
    }

    if (dto.pipelineStageId) {
      const stage = await this.pipelineStageRepository.findOne({
        where: { id: dto.pipelineStageId, workspaceId, deletedAt: null as any },
      });
      if (!stage) {
        throw new NotFoundException('Pipeline stage not found');
      }
    }

    // Validate user assignments
    if (dto.setterId) {
      await this.validateUser(workspaceId, dto.setterId);
    }
    if (dto.callerId) {
      await this.validateUser(workspaceId, dto.callerId);
    }
    if (dto.closerId) {
      await this.validateUser(workspaceId, dto.closerId);
    }

    Object.assign(contact, dto);
    return this.contactRepository.save(contact);
  }

  async autoAssignContact(workspaceId: string, contactId: string) {
    const contact = await this.contactRepository.findOne({
      where: { id: contactId, workspaceId, deletedAt: null as any },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    // Auto-assign to available setter, caller, and closer
    const setter = await this.getAvailableUser(workspaceId, 'setter');
    const caller = await this.getAvailableUser(workspaceId, 'caller');
    const closer = await this.getAvailableUser(workspaceId, 'closer');

    contact.setterId = setter?.id;
    contact.callerId = caller?.id;
    contact.closerId = closer?.id;

    return this.contactRepository.save(contact);
  }

  // ========== Helper Methods ==========

  private async createDefaultStages(workspaceId: string, pipelineId: string) {
    const defaultStages = [
      { name: 'New Lead', color: '#3B82F6', displayOrder: 0 },
      { name: 'Contacted', color: '#8B5CF6', displayOrder: 1 },
      { name: 'Qualified', color: '#10B981', displayOrder: 2 },
      { name: 'Proposal', color: '#F59E0B', displayOrder: 3 },
      { name: 'Negotiation', color: '#EF4444', displayOrder: 4 },
      { name: 'Closed Won', color: '#059669', displayOrder: 5, isClosedWon: true },
      { name: 'Closed Lost', color: '#DC2626', displayOrder: 6, isClosedLost: true },
    ];

    const stages = defaultStages.map((stage) =>
      this.pipelineStageRepository.create({
        ...stage,
        workspaceId,
        pipelineId,
      }),
    );

    await this.pipelineStageRepository.save(stages);
  }

  private async getNextDisplayOrder(workspaceId: string): Promise<number> {
    const result = await this.pipelineRepository
      .createQueryBuilder('pipeline')
      .select('MAX(pipeline.displayOrder)', 'maxOrder')
      .where('pipeline.workspaceId = :workspaceId', { workspaceId })
      .andWhere('pipeline.deletedAt IS NULL')
      .getRawOne();

    return (result?.maxOrder ?? -1) + 1;
  }

  private async getNextStageOrder(pipelineId: string): Promise<number> {
    const result = await this.pipelineStageRepository
      .createQueryBuilder('stage')
      .select('MAX(stage.displayOrder)', 'maxOrder')
      .where('stage.pipelineId = :pipelineId', { pipelineId })
      .andWhere('stage.deletedAt IS NULL')
      .getRawOne();

    return (result?.maxOrder ?? -1) + 1;
  }

  private async validateUser(workspaceId: string, userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId, workspaceId, deletedAt: null as any },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async getAvailableUser(workspaceId: string, role: string) {
    // Simple round-robin assignment - get user with fewest assigned contacts
    const users = await this.userRepository
      .createQueryBuilder('user')
      .leftJoin('contacts', 'contact', `contact.${role}Id = user.id`)
      .where('user.workspaceId = :workspaceId', { workspaceId })
      .andWhere('user.role = :role', { role })
      .andWhere('user.status = :status', { status: 'active' })
      .andWhere('user.deletedAt IS NULL')
      .groupBy('user.id')
      .orderBy('COUNT(contact.id)', 'ASC')
      .limit(1)
      .getOne();

    return users;
  }
}
