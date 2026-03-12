import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  Headers,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DocumentStatus, DocumentProvider } from '../database/entities/document.entity';
import { Public } from '../common/decorators/public.decorator';

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

  @Get('esemneaza/templates')
  @ApiOperation({ summary: 'Get available eSemneaza contract templates' })
  @ApiResponse({ status: 200, description: 'Templates retrieved successfully' })
  async getEsemneazaTemplates(@Req() req: any) {
    return {
      templates: await this.documentsService.getEsemneazaTemplates(req.user.workspaceId),
    };
  }

  @Post('esemneaza/sync')
  @ApiOperation({ summary: 'Import documents from eSemneaza dashboard into CRM' })
  @ApiResponse({ status: 200, description: 'eSemneaza documents synced successfully' })
  async syncEsemneazaDocuments(@Req() req: any) {
    return this.documentsService.syncEsemneazaDocuments(req.user.workspaceId, req.user.id);
  }

  @Post('esemneaza/upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload document file to eSemneaza and get fileName' })
  @ApiResponse({ status: 201, description: 'File uploaded to eSemneaza successfully' })
  async uploadEsemneazaFile(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentsService.uploadEsemneazaFile(req.user.workspaceId, file);
  }

  @Post('esemneaza')
  @ApiOperation({ summary: 'Create and send document via eSemneaza' })
  @ApiResponse({ status: 201, description: 'Document created successfully' })
  async createFromEsemneaza(
    @Req() req: any,
    @Body() body: {
      name: string;
      templateId?: string;
      fileName?: string;
      templateName?: string;
      type: string;
      contactId?: string;
      dealId?: string;
      recipient: {
        email: string;
        name: string;
        phone?: string;
      };
      fields?: Record<string, any>;
      autoSendPaymentLink?: boolean;
      paymentAmount?: number;
      paymentCurrency?: string;
      paymentDescription?: string;
    },
  ) {
    return this.documentsService.createFromEsemneaza(
      req.user.workspaceId,
      req.user.id,
      body,
    );
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

  @Post(':id/payment-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate and send PayFunnels payment link for document' })
  @ApiResponse({ status: 200, description: 'Payment link generated successfully' })
  async generatePaymentLink(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body?: {
      amount?: number;
      currency?: string;
      description?: string;
      sendEmail?: boolean;
    },
  ) {
    return this.documentsService.generatePaymentLinkForDocument(
      req.user.workspaceId,
      id,
      req.user.id,
      body,
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

  @Public()
  @Post('webhooks/esemneaza/:integrationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive eSemneaza webhook' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async handleEsemneazaWebhook(
    @Param('integrationId') integrationId: string,
    @Body() body: any,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.documentsService.processEsemneazaWebhook(integrationId, body, headers);
  }

  @Public()
  @Post('webhooks/payfunnel/:integrationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive PayFunnels webhook' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async handlePayfunnelWebhook(
    @Param('integrationId') integrationId: string,
    @Body() body: any,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    return this.documentsService.processPayfunnelWebhook(integrationId, body, headers);
  }
}
