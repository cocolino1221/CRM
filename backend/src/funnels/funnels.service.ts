import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Funnel, FunnelStatus } from '../database/entities/funnel.entity';
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

  async enroll(contact: { id: string; workspaceId: string; phone?: string }, funnelId: string): Promise<FunnelEnrollment | null> {
    const funnel = await this.funnelRepository.findOne({ where: { id: funnelId, workspaceId: contact.workspaceId } });
    if (!funnel || funnel.status !== FunnelStatus.ACTIVE) {
      this.logger.warn(`enroll(): funnel ${funnelId} not found or not active for workspace ${contact.workspaceId}`);
      return null;
    }
    if (!contact.phone) {
      this.logger.warn(`enroll(): contact ${contact.id} has no phone, cannot start WhatsApp flow`);
      return null;
    }

    const flows = await this.whatsappService.getFlows(contact.workspaceId);
    const flow = flows.find((f: any) => f.id === funnel.flowId && f.enabled);
    if (!flow || !flow.steps?.length) {
      this.logger.warn(`enroll(): flow ${funnel.flowId} not found/enabled/empty for workspace ${contact.workspaceId}`);
      return null;
    }

    const waId = contact.phone;
    const enrollment = this.enrollmentRepository.create({
      workspaceId: contact.workspaceId,
      funnelId: funnel.id,
      contactId: contact.id,
      waId,
      currentStepId: flow.steps[0].id,
    });
    const saved = await this.enrollmentRepository.save(enrollment);

    await this.whatsappService.startFlowForWorkspace(contact.workspaceId, waId, flow.id);

    const anchorStep = flow.steps.find((s: any) => s.anchorOffset);
    if (anchorStep && funnel.anchorDate) {
      const offsetMs = anchorStep.anchorOffset.minutes * 60000 * (anchorStep.anchorOffset.relation === 'before' ? -1 : 1);
      const fireAt = new Date(funnel.anchorDate).getTime() + offsetMs;
      const delayMs = Math.max(0, fireAt - Date.now());
      await this.whatsappService.armFlowStepAt(contact.workspaceId, waId, flow.id, flow.steps[0].id, anchorStep.id, delayMs);
    }

    return saved;
  }

  async setAttended(workspaceId: string, enrollmentId: string, attended: boolean): Promise<FunnelEnrollment> {
    const enrollment = await this.enrollmentRepository.findOne({ where: { id: enrollmentId, workspaceId } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    enrollment.attendedManual = attended;
    const saved = await this.enrollmentRepository.save(enrollment);

    if (attended && enrollment.currentStepId) {
      const funnel = await this.funnelRepository.findOne({ where: { id: enrollment.funnelId, workspaceId } });
      if (funnel) {
        const flows = await this.whatsappService.getFlows(workspaceId);
        const flow = flows.find((f: any) => f.id === funnel.flowId && f.enabled);
        const currentStep = flow?.steps?.find((s: any) => s.id === enrollment.currentStepId);
        if (currentStep?.attendedNextStepId) {
          await this.whatsappService.armFlowStepAt(
            workspaceId, enrollment.waId, funnel.flowId, enrollment.currentStepId, currentStep.attendedNextStepId, 0,
          );
        }
      }
    }

    return saved;
  }
}
