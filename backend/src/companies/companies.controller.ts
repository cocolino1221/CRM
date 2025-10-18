import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Delete,
  Query,
  UseGuards,
  ParseUUIDPipe,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentWorkspace } from '../auth/decorators/current-workspace.decorator';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { QueryCompaniesDto } from './dto/query-companies.dto';

@ApiTags('Companies')
@Controller('companies')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
@ApiBearerAuth()
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all companies with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Companies retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async findAll(
    @CurrentWorkspace('id') workspaceId: string,
    @Query(ValidationPipe) query: QueryCompaniesDto,
  ) {
    return this.companiesService.findAll(workspaceId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get company statistics for workspace' })
  @ApiResponse({ status: 200, description: 'Company statistics retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async getStats(@CurrentWorkspace('id') workspaceId: string) {
    return this.companiesService.getStats(workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get company by ID' })
  @ApiParam({ name: 'id', description: 'Company ID' })
  @ApiQuery({ name: 'include', required: false, description: 'Relations to include (contacts,deals)' })
  @ApiResponse({ status: 200, description: 'Company retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  @Roles('admin', 'user', 'viewer')
  async findOne(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('include') include?: string,
  ) {
    const relations = include ? include.split(',').filter(r => ['contacts', 'deals'].includes(r)) : [];
    return this.companiesService.findOne(workspaceId, id, relations);
  }

  @Get(':id/contacts')
  @ApiOperation({ summary: 'Get all contacts for a company' })
  @ApiParam({ name: 'id', description: 'Company ID' })
  @ApiResponse({ status: 200, description: 'Contacts retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  @Roles('admin', 'user', 'viewer')
  async getContacts(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.companiesService.getContacts(workspaceId, id);
  }

  @Get(':id/deals')
  @ApiOperation({ summary: 'Get all deals for a company' })
  @ApiParam({ name: 'id', description: 'Company ID' })
  @ApiResponse({ status: 200, description: 'Deals retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  @Roles('admin', 'user', 'viewer')
  async getDeals(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.companiesService.getDeals(workspaceId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create new company' })
  @ApiBody({ type: CreateCompanyDto })
  @ApiResponse({ status: 201, description: 'Company created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @Roles('admin', 'user')
  async create(
    @CurrentWorkspace('id') workspaceId: string,
    @Body(ValidationPipe) createCompanyDto: CreateCompanyDto,
  ) {
    return this.companiesService.create(workspaceId, createCompanyDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update company by ID' })
  @ApiParam({ name: 'id', description: 'Company ID' })
  @ApiBody({ type: UpdateCompanyDto })
  @ApiResponse({ status: 200, description: 'Company updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  @Roles('admin', 'user')
  async update(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) updateCompanyDto: UpdateCompanyDto,
  ) {
    return this.companiesService.update(workspaceId, id, updateCompanyDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete company by ID (soft delete)' })
  @ApiParam({ name: 'id', description: 'Company ID' })
  @ApiResponse({ status: 204, description: 'Company deleted successfully' })
  @ApiResponse({ status: 404, description: 'Company not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'user')
  async remove(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.companiesService.remove(workspaceId, id);
  }

  @Post('bulk/delete')
  @ApiOperation({ summary: 'Bulk delete companies' })
  @ApiBody({ schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string', format: 'uuid' } } } } })
  @ApiResponse({ status: 200, description: 'Companies deleted successfully' })
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'user')
  async bulkDelete(
    @CurrentWorkspace('id') workspaceId: string,
    @Body('ids') ids: string[],
  ) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs array is required and cannot be empty');
    }
    return this.companiesService.bulkDelete(workspaceId, ids);
  }
}