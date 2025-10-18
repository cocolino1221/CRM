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
import { ContactsService } from './contacts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { WorkspaceGuard } from '../auth/guards/workspace.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentWorkspace } from '../auth/decorators/current-workspace.decorator';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { QueryContactsDto } from './dto/query-contacts.dto';
import { ImportContactsDto } from './dto/import-contacts.dto';
import { MergeContactsDto } from './dto/merge-contacts.dto';
import { Contact, ContactStatus } from '../database/entities/contact.entity';
import { User } from '../database/entities/user.entity';

@ApiTags('Contacts')
@Controller('contacts')
@UseGuards(JwtAuthGuard, WorkspaceGuard, RolesGuard)
@ApiBearerAuth()
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all contacts with filtering and pagination' })
  @ApiResponse({ status: 200, description: 'Contacts retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async findAll(
    @CurrentWorkspace('id') workspaceId: string,
    @Query(ValidationPipe) query: QueryContactsDto,
  ) {
    return this.contactsService.findAll(workspaceId, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get contact statistics for workspace' })
  @ApiResponse({ status: 200, description: 'Contact statistics retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async getStats(@CurrentWorkspace('id') workspaceId: string) {
    return this.contactsService.getContactStats(workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get contact by ID' })
  @ApiParam({ name: 'id', description: 'Contact ID' })
  @ApiQuery({ name: 'include', required: false, description: 'Relations to include (company,owner,deals,activities)' })
  @ApiResponse({ status: 200, description: 'Contact retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  @Roles('admin', 'user', 'viewer')
  async findOne(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('include') include?: string,
  ) {
    const relations = include ? include.split(',').filter(r => ['company', 'owner', 'deals', 'activities'].includes(r)) : [];
    return this.contactsService.findOne(workspaceId, id, relations);
  }

  @Post()
  @ApiOperation({ summary: 'Create new contact' })
  @ApiBody({ type: CreateContactDto })
  @ApiResponse({ status: 201, description: 'Contact created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 409, description: 'Contact with email already exists' })
  @Roles('admin', 'user')
  async create(
    @CurrentWorkspace('id') workspaceId: string,
    @Body(ValidationPipe) createContactDto: CreateContactDto,
  ) {
    return this.contactsService.create(workspaceId, createContactDto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update contact by ID' })
  @ApiParam({ name: 'id', description: 'Contact ID' })
  @ApiBody({ type: UpdateContactDto })
  @ApiResponse({ status: 200, description: 'Contact updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  @ApiResponse({ status: 409, description: 'Contact with email already exists' })
  @Roles('admin', 'user')
  async update(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(ValidationPipe) updateContactDto: UpdateContactDto,
  ) {
    return this.contactsService.update(workspaceId, id, updateContactDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete contact by ID (soft delete)' })
  @ApiParam({ name: 'id', description: 'Contact ID' })
  @ApiResponse({ status: 204, description: 'Contact deleted successfully' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Roles('admin', 'user')
  async remove(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.contactsService.remove(workspaceId, id);
  }

  @Put(':id/status')
  @ApiOperation({ summary: 'Update contact status' })
  @ApiParam({ name: 'id', description: 'Contact ID' })
  @ApiBody({ schema: { type: 'object', properties: { status: { enum: Object.values(ContactStatus) } } } })
  @ApiResponse({ status: 200, description: 'Contact status updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid status value' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  @Roles('admin', 'user')
  async updateStatus(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('status') status: ContactStatus,
  ) {
    if (!Object.values(ContactStatus).includes(status)) {
      throw new BadRequestException('Invalid status value');
    }
    return this.contactsService.updateStatus(workspaceId, id, status);
  }

  @Post('bulk/delete')
  @ApiOperation({ summary: 'Bulk delete contacts' })
  @ApiBody({ schema: { type: 'object', properties: { ids: { type: 'array', items: { type: 'string', format: 'uuid' } } } } })
  @ApiResponse({ status: 200, description: 'Contacts deleted successfully' })
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'user')
  async bulkDelete(
    @CurrentWorkspace('id') workspaceId: string,
    @Body('ids') ids: string[],
  ) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs array is required and cannot be empty');
    }
    return this.contactsService.bulkDelete(workspaceId, ids);
  }

  @Post('bulk/status')
  @ApiOperation({ summary: 'Bulk update contact status' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string', format: 'uuid' } },
        status: { enum: Object.values(ContactStatus) }
      }
    }
  })
  @ApiResponse({ status: 200, description: 'Contact statuses updated successfully' })
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'user')
  async bulkUpdateStatus(
    @CurrentWorkspace('id') workspaceId: string,
    @Body('ids') ids: string[],
    @Body('status') status: ContactStatus,
  ) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BadRequestException('IDs array is required and cannot be empty');
    }
    if (!Object.values(ContactStatus).includes(status)) {
      throw new BadRequestException('Invalid status value');
    }
    return this.contactsService.bulkUpdateStatus(workspaceId, ids, status);
  }

  @Post('bulk/import')
  @ApiOperation({ summary: 'Bulk import contacts' })
  @ApiBody({ type: ImportContactsDto })
  @ApiResponse({ status: 200, description: 'Contacts imported successfully' })
  @HttpCode(HttpStatus.OK)
  @Roles('admin', 'user')
  async bulkImport(
    @CurrentWorkspace('id') workspaceId: string,
    @Body(ValidationPipe) importDto: ImportContactsDto,
  ) {
    return this.contactsService.bulkImport(workspaceId, importDto.contacts);
  }

  @Get('export')
  @ApiOperation({ summary: 'Export all contacts' })
  @ApiQuery({ name: 'format', required: false, enum: ['json', 'csv'], description: 'Export format' })
  @ApiResponse({ status: 200, description: 'Contacts exported successfully' })
  @Roles('admin', 'user')
  async exportContacts(
    @CurrentWorkspace('id') workspaceId: string,
    @Query('format') format?: 'json' | 'csv',
  ) {
    return this.contactsService.exportContacts(workspaceId, format || 'json');
  }

  @Post('merge')
  @ApiOperation({ summary: 'Merge multiple contacts into one' })
  @ApiBody({ type: MergeContactsDto })
  @ApiResponse({ status: 200, description: 'Contacts merged successfully' })
  @ApiResponse({ status: 404, description: 'One or more contacts not found' })
  @Roles('admin', 'user')
  async mergeContacts(
    @CurrentWorkspace('id') workspaceId: string,
    @Body(ValidationPipe) mergeDto: MergeContactsDto,
  ) {
    return this.contactsService.mergeContacts(
      workspaceId,
      mergeDto.primaryContactId,
      mergeDto.contactIdsToMerge,
    );
  }

  @Get(':id/activities')
  @ApiOperation({ summary: 'Get all activities for a contact' })
  @ApiParam({ name: 'id', description: 'Contact ID' })
  @ApiResponse({ status: 200, description: 'Activities retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  @Roles('admin', 'user', 'viewer')
  async getActivities(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.contactsService.getActivities(workspaceId, id);
  }

  @Post(':id/tags')
  @ApiOperation({ summary: 'Add tags to a contact' })
  @ApiParam({ name: 'id', description: 'Contact ID' })
  @ApiBody({ schema: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } } } })
  @ApiResponse({ status: 200, description: 'Tags added successfully' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  @Roles('admin', 'user')
  async addTags(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('tags') tags: string[],
  ) {
    if (!Array.isArray(tags) || tags.length === 0) {
      throw new BadRequestException('Tags array is required and cannot be empty');
    }
    return this.contactsService.addTags(workspaceId, id, tags);
  }

  @Delete(':id/tags')
  @ApiOperation({ summary: 'Remove tags from a contact' })
  @ApiParam({ name: 'id', description: 'Contact ID' })
  @ApiBody({ schema: { type: 'object', properties: { tags: { type: 'array', items: { type: 'string' } } } } })
  @ApiResponse({ status: 200, description: 'Tags removed successfully' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  @Roles('admin', 'user')
  async removeTags(
    @CurrentWorkspace('id') workspaceId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('tags') tags: string[],
  ) {
    if (!Array.isArray(tags) || tags.length === 0) {
      throw new BadRequestException('Tags array is required and cannot be empty');
    }
    return this.contactsService.removeTags(workspaceId, id, tags);
  }

  @Get('analytics/overview')
  @ApiOperation({ summary: 'Get leads analytics overview' })
  @ApiResponse({ status: 200, description: 'Analytics data retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async getAnalyticsOverview(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser() user: User,
  ) {
    // Admins and managers see all data, other roles only see their own
    const ownerId = ['admin', 'manager'].includes(user.role) ? undefined : user.id;
    return this.contactsService.getAnalyticsOverview(workspaceId, ownerId);
  }

  @Get('analytics/by-tags')
  @ApiOperation({ summary: 'Get analytics grouped by tags' })
  @ApiResponse({ status: 200, description: 'Tag analytics retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async getAnalyticsByTags(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser() user: User,
  ) {
    // Admins and managers see all data, other roles only see their own
    const ownerId = ['admin', 'manager'].includes(user.role) ? undefined : user.id;
    return this.contactsService.getAnalyticsByTags(workspaceId, ownerId);
  }

  @Get('analytics/conversion-funnel')
  @ApiOperation({ summary: 'Get conversion funnel analytics' })
  @ApiResponse({ status: 200, description: 'Funnel data retrieved successfully' })
  @Roles('admin', 'user', 'viewer')
  async getConversionFunnel(
    @CurrentWorkspace('id') workspaceId: string,
    @CurrentUser() user: User,
  ) {
    // Admins and managers see all data, other roles only see their own
    const ownerId = ['admin', 'manager'].includes(user.role) ? undefined : user.id;
    return this.contactsService.getConversionFunnel(workspaceId, ownerId);
  }
}