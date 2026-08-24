import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Funnel } from '../database/entities/funnel.entity';
import { FunnelEnrollment } from '../database/entities/funnel-enrollment.entity';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';
import { CreateFunnelDto } from './dto/create-funnel.dto';
import { UpdateFunnelDto } from './dto/update-funnel.dto';

@Injectable()
export class FunnelsService {
  private readonly logger = new Logger(FunnelsService.name);

  constructor(
    @InjectRepository(Funnel)
    private readonly funnelRepository: Repository<Funnel>,
    @InjectRepository(FunnelEnrollment)
    private readonly enrollmentRepository: Repository<FunnelEnrollment>,
    private readonly whatsappService: WhatsAppService,
  ) {}

  async create(workspaceId: string, dto: CreateFunnelDto): Promise<Funnel> {
    const funnel = this.funnelRepository.create({
      ...dto,
      workspaceId,
      anchorDate: dto.anchorDate ? new Date(dto.anchorDate) : undefined,
    });
    return this.funnelRepository.save(funnel);
  }

  async findAll(workspaceId: string): Promise<Funnel[]> {
    return this.funnelRepository.find({ where: { workspaceId }, order: { createdAt: 'DESC' } });
  }

  async findOne(workspaceId: string, id: string): Promise<Funnel> {
    const funnel = await this.funnelRepository.findOne({ where: { id, workspaceId } });
    if (!funnel) throw new NotFoundException('Funnel not found');
    return funnel;
  }

  async update(workspaceId: string, id: string, dto: UpdateFunnelDto): Promise<Funnel> {
    const funnel = await this.findOne(workspaceId, id);
    Object.assign(funnel, {
      ...dto,
      anchorDate: dto.anchorDate ? new Date(dto.anchorDate) : funnel.anchorDate,
    });
    return this.funnelRepository.save(funnel);
  }

  async remove(workspaceId: string, id: string): Promise<void> {
    const funnel = await this.findOne(workspaceId, id);
    await this.funnelRepository.remove(funnel);
  }
}
