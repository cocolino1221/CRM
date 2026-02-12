import {
  Controller,
  Get,
  Post,
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
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DocumentStatus, DocumentProvider } from '../database/entities/document.entity';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('documents')
@UseGuards(JwtAuthGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @ApiOperation({ summary: 'Get all documents' })
  @ApiResponse({ status: 200, description: 'Documents retrieved successfully' })
  async findAll(
    @Req() req: any,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: DocumentStatus,
    @Query('provider') provider?: DocumentProvider,
    @Query('contactId') contactId?: string,
    @Query('dealId') dealId?: string,
    @Query('createdById') createdById?: string,
  ) {
    return this.documentsService.findAll(req.user.workspaceId, {
      page,
      limit,
      search,
      status,
      provider,
      contactId,
      dealId,
      createdById,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get document by ID' })
  @ApiResponse({ status: 200, description: 'Document retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async findOne(@Req() req: any, @Param('id') id: string) {
    return this.documentsService.findOne(req.user.workspaceId, id);
  }

  @Post('pandadoc')
  @ApiOperation({ summary: 'Create document from PandaDoc template' })
  @ApiResponse({ status: 201, description: 'Document created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createFromPandaDoc(
    @Req() req: any,
    @Body() body: {
      name: string;
      templateId: string;
      type: string;
      contactId?: string;
      dealId?: string;
      recipients: Array<{
        email: string;
        firstName?: string;
        lastName?: string;
        role?: string;
      }>;
      tokens?: Array<{
        name: string;
        value: string;
      }>;
      fields?: Record<string, any>;
      autoSend?: boolean;
    },
  ) {
    return this.documentsService.createFromPandaDoc(
      req.user.workspaceId,
      req.user.id,
      body
    );
  }

  @Post('docusign')
  @ApiOperation({ summary: 'Create document from DocuSign template' })
  @ApiResponse({ status: 201, description: 'Document created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async createFromDocuSign(
    @Req() req: any,
    @Body() body: {
      name: string;
      templateId: string;
      type: string;
      contactId?: string;
      dealId?: string;
      recipients: Array<{
        email: string;
        name: string;
        roleName?: string;
      }>;
      tabs?: Record<string, any>;
      autoSend?: boolean;
    },
  ) {
    return this.documentsService.createFromDocuSign(
      req.user.workspaceId,
      req.user.id,
      body
    );
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send document for signing' })
  @ApiResponse({ status: 200, description: 'Document sent successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async sendDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body?: {
      message?: string;
      subject?: string;
    },
  ) {
    return this.documentsService.sendDocument(
      req.user.workspaceId,
      id,
      req.user.id,
      body
    );
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Void a document' })
  @ApiResponse({ status: 200, description: 'Document voided successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async voidDocument(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body?: {
      reason?: string;
    },
  ) {
    return this.documentsService.voidDocument(
      req.user.workspaceId,
      id,
      req.user.id,
      body?.reason
    );
  }

  @Post(':id/sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync document status from provider' })
  @ApiResponse({ status: 200, description: 'Document synced successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async syncDocument(@Req() req: any, @Param('id') id: string) {
    return this.documentsService.syncDocument(req.user.workspaceId, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete document' })
  @ApiResponse({ status: 204, description: 'Document deleted successfully' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async deleteDocument(@Req() req: any, @Param('id') id: string) {
    await this.documentsService.deleteDocument(req.user.workspaceId, id);
  }
}
