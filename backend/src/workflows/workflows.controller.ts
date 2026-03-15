import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { AuthenticatedRequest } from '../auth/interfaces/authenticated-request.interface';
import { WorkflowsService } from './workflows.service';
import { WorkflowTemplatesService } from './workflow-templates.service';
import { CreateWorkflowDto, UpdateWorkflowDto } from './dto/workflow.dto';
import { WorkflowStatus, WorkflowTriggerType } from '../database/entities/workflow.entity';

@ApiTags('Workflows')
@Controller('workflows')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@ApiBearerAuth()
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly workflowTemplatesService: WorkflowTemplatesService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get all workflows' })
  @ApiResponse({ status: 200, description: 'Workflows retrieved successfully' })
  async findAll(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: WorkflowStatus,
    @Query('triggerType') triggerType?: WorkflowTriggerType,
  ) {
    return this.workflowsService.findAll(req.user.workspaceId, { status, triggerType });
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get workflow statistics' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  async getStats(@Req() req: AuthenticatedRequest) {
    return this.workflowsService.getStats(req.user.workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow by ID' })
  @ApiResponse({ status: 200, description: 'Workflow retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  async findOne(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflowsService.findOne(id, req.user.workspaceId);
  }

  @Post()
  @ApiOperation({ summary: 'Create new workflow' })
  @ApiResponse({ status: 201, description: 'Workflow created successfully' })
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() createWorkflowDto: CreateWorkflowDto,
  ) {
    return this.workflowsService.create(
      req.user.workspaceId,
      req.user.id,
      createWorkflowDto,
    );
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update workflow' })
  @ApiResponse({ status: 200, description: 'Workflow updated successfully' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  async update(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() updateWorkflowDto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(id, req.user.workspaceId, updateWorkflowDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Partially update workflow' })
  @ApiResponse({ status: 200, description: 'Workflow updated successfully' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  async patchUpdate(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() updateWorkflowDto: UpdateWorkflowDto,
  ) {
    return this.workflowsService.update(id, req.user.workspaceId, updateWorkflowDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete workflow' })
  @ApiResponse({ status: 204, description: 'Workflow deleted successfully' })
  @ApiResponse({ status: 404, description: 'Workflow not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.workflowsService.delete(id, req.user.workspaceId);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: 'Activate workflow' })
  @ApiResponse({ status: 200, description: 'Workflow activated successfully' })
  async activate(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflowsService.activate(id, req.user.workspaceId);
  }

  @Post(':id/pause')
  @ApiOperation({ summary: 'Pause workflow' })
  @ApiResponse({ status: 200, description: 'Workflow paused successfully' })
  async pause(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.workflowsService.pause(id, req.user.workspaceId);
  }

  @Post(':id/execute')
  @ApiOperation({ summary: 'Manually execute workflow' })
  @ApiResponse({ status: 200, description: 'Workflow executed successfully' })
  async execute(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Body() triggerData: any,
  ) {
    return this.workflowsService.execute(id, triggerData);
  }

  @Get(':id/executions')
  @ApiOperation({ summary: 'Get workflow execution history' })
  @ApiResponse({ status: 200, description: 'Executions retrieved successfully' })
  async getExecutions(
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: number,
  ) {
    return this.workflowsService.getExecutions(
      id,
      req.user.workspaceId,
      limit ? parseInt(String(limit)) : 50,
    );
  }

  // Workflow Templates Endpoints

  @Get('templates/all')
  @ApiOperation({ summary: 'Get all workflow templates' })
  @ApiResponse({ status: 200, description: 'Templates retrieved successfully' })
  async getAllTemplates(
    @Query('category') category?: string,
    @Query('recommended') recommended?: boolean,
    @Query('tags') tags?: string,
  ) {
    const filters: any = {};
    if (category) filters.category = category;
    if (recommended !== undefined) {
      filters.recommended = typeof recommended === 'string' ? recommended === 'true' : recommended;
    }
    if (tags) filters.tags = tags.split(',');

    return this.workflowTemplatesService.getAllTemplates(filters);
  }

  @Get('templates/recommended')
  @ApiOperation({ summary: 'Get recommended workflow templates' })
  @ApiResponse({ status: 200, description: 'Recommended templates retrieved successfully' })
  async getRecommendedTemplates() {
    return this.workflowTemplatesService.getRecommendedTemplates();
  }

  @Get('templates/categories')
  @ApiOperation({ summary: 'Get workflow template categories' })
  @ApiResponse({ status: 200, description: 'Categories retrieved successfully' })
  async getTemplateCategories() {
    return this.workflowTemplatesService.getCategories();
  }

  @Get('templates/tags')
  @ApiOperation({ summary: 'Get all workflow template tags' })
  @ApiResponse({ status: 200, description: 'Tags retrieved successfully' })
  async getTemplateTags() {
    return this.workflowTemplatesService.getAllTags();
  }

  @Get('templates/search')
  @ApiOperation({ summary: 'Search workflow templates' })
  @ApiResponse({ status: 200, description: 'Search results returned' })
  async searchTemplates(@Query('q') query: string) {
    return this.workflowTemplatesService.searchTemplates(query);
  }

  @Get('templates/:templateId')
  @ApiOperation({ summary: 'Get specific workflow template' })
  @ApiResponse({ status: 200, description: 'Template retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async getTemplate(@Param('templateId') templateId: string) {
    const template = this.workflowTemplatesService.getTemplate(templateId);
    if (!template) {
      return { error: 'Template not found' };
    }
    return template;
  }

  @Post('templates/:templateId/create')
  @ApiOperation({ summary: 'Create workflow from template' })
  @ApiResponse({ status: 201, description: 'Workflow created from template' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async createFromTemplate(
    @Param('templateId') templateId: string,
    @Req() req: AuthenticatedRequest,
    @Body() customizations?: { name?: string; description?: string },
  ) {
    const template = this.workflowTemplatesService.getTemplate(templateId);
    if (!template) {
      return { error: 'Template not found' };
    }

    // Create workflow from template
    const workflowData = {
      name: customizations?.name || template.name,
      description: customizations?.description || template.description,
      triggerType: template.triggerType,
      actions: template.actions,
    };

    return this.workflowsService.create(
      req.user.workspaceId,
      req.user.id,
      workflowData,
    );
  }
}
