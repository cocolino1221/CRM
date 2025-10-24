import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
  ValidationPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PipelineService } from './pipeline.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentWorkspace } from '../auth/decorators/current-workspace.decorator';
import { CreatePipelineDto, CreatePipelineStageDto } from './dto/create-pipeline.dto';
import { UpdateContactPipelineDto } from './dto/update-contact-pipeline.dto';

@ApiTags('Pipelines')
@Controller('pipelines')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
@ApiBearerAuth()
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  // ========== Pipeline Endpoints ==========

  @Post()
  @ApiOperation({ summary: 'Create a new pipeline' })
  @Roles('admin', 'manager')
  async createPipeline(
    @CurrentWorkspace('id') workspaceId: string,
    @Body(ValidationPipe) dto: CreatePipelineDto,
  ) {
    return this.pipelineService.createPipeline(workspaceId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all pipelines' })
  @Roles('admin', 'manager', 'closer', 'setter', 'caller', 'sales_rep')
  async getPipelines(@CurrentWorkspace('id') workspaceId: string) {
    return this.pipelineService.getPipelines(workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get pipeline by ID' })
  @Roles('admin', 'manager', 'closer', 'setter', 'caller', 'sales_rep')
  async getPipeline(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pipelineService.getPipelineById(workspaceId, id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update pipeline' })
  @Roles('admin', 'manager')
  async updatePipeline(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) dto: Partial<CreatePipelineDto>,
  ) {
    return this.pipelineService.updatePipeline(workspaceId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete pipeline' })
  @Roles('admin', 'manager')
  async deletePipeline(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.pipelineService.deletePipeline(workspaceId, id);
  }

  // ========== Stage Endpoints ==========

  @Post(':pipelineId/stages')
  @ApiOperation({ summary: 'Create a new stage in pipeline' })
  @Roles('admin', 'manager')
  async createStage(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('pipelineId', ParseUUIDPipe) pipelineId: string,
    @Body(ValidationPipe) dto: CreatePipelineStageDto,
  ) {
    return this.pipelineService.createStage(workspaceId, pipelineId, dto);
  }

  @Put('stages/:id')
  @ApiOperation({ summary: 'Update stage' })
  @Roles('admin', 'manager')
  async updateStage(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) dto: Partial<CreatePipelineStageDto>,
  ) {
    return this.pipelineService.updateStage(workspaceId, id, dto);
  }

  @Delete('stages/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete stage' })
  @Roles('admin', 'manager')
  async deleteStage(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.pipelineService.deleteStage(workspaceId, id);
  }

  // ========== Contact Pipeline Endpoints ==========

  @Put('contacts/:contactId')
  @ApiOperation({ summary: 'Update contact pipeline and assignments' })
  @Roles('admin', 'manager', 'closer', 'setter', 'caller', 'sales_rep')
  async updateContactPipeline(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
    @Body(ValidationPipe) dto: UpdateContactPipelineDto,
  ) {
    return this.pipelineService.updateContactPipeline(workspaceId, contactId, dto);
  }

  @Post('contacts/:contactId/auto-assign')
  @ApiOperation({ summary: 'Auto-assign contact to team members' })
  @Roles('admin', 'manager')
  async autoAssignContact(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('contactId', ParseUUIDPipe) contactId: string,
  ) {
    return this.pipelineService.autoAssignContact(workspaceId, contactId);
  }
}
