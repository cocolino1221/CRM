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

  @Get('esemneaza/template-automation')
  @ApiOperation({ summary: 'Get template-based payment automation rules for eSemneaza' })
  @ApiResponse({ status: 200, description: 'Template automation rules retrieved successfully' })
  async getEsemneazaTemplateAutomation(@Req() req: any) {
    return this.documentsService.getEsemneazaTemplatePaymentAutomation(req.user.workspaceId);
  }

  @Post('esemneaza/template-automation')
  @ApiOperation({ summary: 'Save template-based payment automation rules for eSemneaza' })
  @ApiResponse({ status: 200, description: 'Template automation rules saved successfully' })
  async saveEsemneazaTemplateAutomation(
    @Req() req: any,
    @Body() body: {
      rules: Array<{
        templateId: string;
        autoSendPaymentLink?: boolean;
        amount?: number;
        currency?: string;
        description?: string;
        paymentLinkUrl?: string;
        paymentLinkName?: string;
      }>;
    },
  ) {
    return this.documentsService.updateEsemneazaTemplatePaymentAutomation(
      req.user.workspaceId,
      body?.rules || [],
    );
  }

  @Get('payfunnel/link-options')
  @ApiOperation({ summary: 'Get available PayFunnels links for manual selection' })
  @ApiResponse({ status: 200, description: 'PayFunnels links retrieved successfully' })
  async getPayfunnelLinkOptions(@Req() req: any) {
    return this.documentsService.getPayfunnelLinkOptions(req.user.workspaceId);
  }

  @Get('payfunnel/dashboard')
  @ApiOperation({ summary: 'Get PayFunnels payments, subscriptions and payment links' })
  @ApiResponse({ status: 200, description: 'PayFunnels dashboard data retrieved successfully' })
  async getPayfunnelDashboard(@Req() req: any) {
    return this.documentsService.getPayfunnelDashboardData(req.user.workspaceId);
  }

  @Get('esemneaza/requests')
  @ApiOperation({ summary: 'List eSemneaza sign requests' })
  @ApiResponse({ status: 200, description: 'Sign requests retrieved successfully' })
  async listEsemneazaRequests(
    @Req() req: any,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = Number(limit);
    return {
      requests: await this.documentsService.listEsemneazaRequests(req.user.workspaceId, {
        cursor,
        limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      }),
    };
  }

  @Get('esemneaza/requests/:requestId')
  @ApiOperation({ summary: 'Get eSemneaza sign request details' })
  @ApiResponse({ status: 200, description: 'Sign request retrieved successfully' })
  async getEsemneazaRequestDetails(
    @Req() req: any,
    @Param('requestId') requestId: string,
  ) {
    return this.documentsService.getEsemneazaRequestDetails(req.user.workspaceId, requestId);
  }

  @Post('esemneaza/requests/:requestId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel eSemneaza sign request' })
  @ApiResponse({ status: 200, description: 'Sign request canceled successfully' })
  async cancelEsemneazaRequest(
    @Req() req: any,
    @Param('requestId') requestId: string,
  ) {
    return this.documentsService.cancelEsemneazaRequest(req.user.workspaceId, requestId, req.user.id);
  }

  @Get('esemneaza/requests/:requestId/temp-download-url')
  @ApiOperation({ summary: 'Get eSemneaza temporary document download URL' })
  @ApiResponse({ status: 200, description: 'Temporary download URL generated successfully' })
  async getEsemneazaTempDownloadUrl(
    @Req() req: any,
    @Param('requestId') requestId: string,
  ) {
    return this.documentsService.getEsemneazaRequestTempDownloadUrl(req.user.workspaceId, requestId);
  }

  @Get('esemneaza/requests/:requestId/completed-download-url')
  @ApiOperation({ summary: 'Get eSemneaza completed document download URL' })
  @ApiResponse({ status: 200, description: 'Completed download URL generated successfully' })
  async getEsemneazaCompletedDownloadUrl(
    @Req() req: any,
    @Param('requestId') requestId: string,
  ) {
    return this.documentsService.getEsemneazaRequestCompletedDownloadUrl(req.user.workspaceId, requestId);
  }

  @Post('esemneaza/recipients/sign-on-behalf')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign on behalf of an eSemneaza recipient' })
  @ApiResponse({ status: 200, description: 'Sign on behalf accepted successfully' })
  async signEsemneazaOnBehalf(
    @Req() req: any,
    @Body() body: { token: string; signatureText: string },
  ) {
    return this.documentsService.signEsemneazaRecipientOnBehalf(req.user.workspaceId, req.user.id, body);
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
      paymentLinkUrl?: string;
      paymentLinkName?: string;
      sendPaymentEmail?: boolean;
      sendPaymentWhatsApp?: boolean;
    },
  ) {
    return this.documentsService.createFromEsemneaza(
      req.user.workspaceId,
      req.user.id,
      body,
    );
  }

  @Get('payments')
  @ApiOperation({ summary: 'Get document payments from PayFunnels metadata' })
  @ApiResponse({ status: 200, description: 'Payments retrieved successfully' })
  async getPayments(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: 'paid' | 'failed' | 'pending',
  ) {
    const parsedPage = Number(page);
    const parsedLimit = Number(limit);
    return this.documentsService.findPayments(req.user.workspaceId, {
      page: Number.isFinite(parsedPage) ? parsedPage : undefined,
      limit: Number.isFinite(parsedLimit) ? parsedLimit : undefined,
      search,
      status,
    });
  }

  @Delete('payments/:documentId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a payment transaction from CRM payments list' })
  @ApiResponse({ status: 200, description: 'Payment transaction removed successfully' })
  async deletePaymentTransaction(
    @Req() req: any,
    @Param('documentId') documentId: string,
    @Query('deleteDocument') deleteDocument?: string,
  ) {
    const shouldDeleteDocument = ['1', 'true', 'yes', 'on'].includes(
      String(deleteDocument || '').trim().toLowerCase(),
    );
    return this.documentsService.deletePaymentTransaction(req.user.workspaceId, req.user.id, documentId, {
      deleteDocument: shouldDeleteDocument,
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
      sendWhatsApp?: boolean;
      paymentLinkUrl?: string;
      paymentLinkName?: string;
    },
  ) {
    return this.documentsService.generatePaymentLinkForDocument(
      req.user.workspaceId,
      id,
      req.user.id,
      body,
    );
  }

  @Post(':id/esemneaza/remind')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send eSemneaza reminder to recipient by email' })
  @ApiResponse({ status: 200, description: 'Reminder sent successfully' })
  async remindEsemneazaRecipient(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { email: string },
  ) {
    return this.documentsService.remindEsemneazaRecipient(
      req.user.workspaceId,
      id,
      req.user.id,
      body?.email,
    );
  }

  @Post(':id/esemneaza/sign')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign eSemneaza request with API account default signature' })
  @ApiResponse({ status: 200, description: 'Sign request accepted' })
  async signEsemneazaRequest(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.documentsService.signEsemneazaRequest(
      req.user.workspaceId,
      id,
      req.user.id,
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
