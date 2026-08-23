import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../../auth/guards/workspace.guard';
import { AuthenticatedRequest } from '../../auth/interfaces/authenticated-request.interface';
import { Integration } from '../../database/entities/integration.entity';
import { MetaLeadsService } from './meta-leads.service';

@ApiTags('Meta Lead Ads')
@Controller('integrations/meta-leads')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@ApiBearerAuth()
export class MetaLeadsController {
  constructor(
    private readonly metaLeadsService: MetaLeadsService,
    @InjectRepository(Integration)
    private readonly integrationRepository: Repository<Integration>,
  ) {}

  private async findIntegration(id: string, workspaceId: string): Promise<Integration> {
    const integration = await this.integrationRepository.findOne({ where: { id, workspaceId } });
    if (!integration) throw new NotFoundException('Integration not found');
    return integration;
  }

  @Get(':id/available-forms')
  @ApiOperation({ summary: 'List Lead Ads forms available on the connected Facebook Page' })
  async getAvailableForms(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const integration = await this.findIntegration(id, req.user.workspaceId);
    const forms = await this.metaLeadsService.listAvailableForms(integration);
    return { forms };
  }

  @Post(':id/subscribe')
  @ApiOperation({ summary: 'Subscribe the connected Page to leadgen webhook events' })
  async subscribe(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const integration = await this.findIntegration(id, req.user.workspaceId);
    return this.metaLeadsService.subscribePageToLeadgen(integration);
  }

  @Get(':id/forms')
  @ApiOperation({ summary: 'Get connected Lead Ads forms for this integration' })
  async getForms(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const integration = await this.findIntegration(id, req.user.workspaceId);
    return { forms: integration.config?.metaLeadForms || [] };
  }

  @Post(':id/forms')
  @ApiOperation({ summary: 'Connect a Lead Ads form to this integration' })
  async addForm(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { formId: string; name?: string; pipelineId?: string; pipelineStageId?: string; whatsApp?: any; funnelId?: string },
  ) {
    const integration = await this.findIntegration(id, req.user.workspaceId);
    const pageId = String(integration.config?.pageId || '').trim();
    if (!pageId) throw new BadRequestException('Connect a Facebook Page before adding a Lead Ads form');

    const result = await this.metaLeadsService.addForm(integration, body.formId, pageId, body);
    integration.config = { ...integration.config, metaLeadForms: result.forms };
    await this.integrationRepository.save(integration);

    return { success: true, form: result.form };
  }

  @Delete(':id/forms/:formId')
  @ApiOperation({ summary: 'Disconnect a Lead Ads form from this integration' })
  async removeForm(
    @Param('id') id: string,
    @Param('formId') formId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const integration = await this.findIntegration(id, req.user.workspaceId);
    const forms = this.metaLeadsService.removeForm(integration, formId);
    integration.config = { ...integration.config, metaLeadForms: forms };
    await this.integrationRepository.save(integration);
    return { success: true };
  }

  @Patch(':id/forms/:formId')
  @ApiOperation({ summary: 'Update pipeline/WhatsApp config for a connected Lead Ads form' })
  async updateForm(
    @Param('id') id: string,
    @Param('formId') formId: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { name?: string; pipelineId?: string; pipelineStageId?: string; whatsApp?: any; enabled?: boolean; funnelId?: string },
  ) {
    const integration = await this.findIntegration(id, req.user.workspaceId);
    const forms = this.metaLeadsService.updateFormConfig(integration, formId, body);
    integration.config = { ...integration.config, metaLeadForms: forms };
    await this.integrationRepository.save(integration);
    return { success: true };
  }
}
