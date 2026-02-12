import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { WhatsAppService, WhatsAppMessage, WhatsAppWebhook } from './whatsapp.service';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@ApiTags('WhatsApp Business')
@Controller('integrations/whatsapp')
export class WhatsAppController {
  constructor(private readonly whatsappService: WhatsAppService) {}

  @Public()
  @Get('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify WhatsApp webhook' })
  @ApiResponse({ status: 200, description: 'Webhook verified' })
  @ApiResponse({ status: 403, description: 'Verification failed' })
  async verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const result = await this.whatsappService.verifyWebhookToken(mode, token, challenge);
    if (result) {
      return result;
    }
    throw new BadRequestException('Webhook verification failed');
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive WhatsApp webhook events' })
  @ApiResponse({ status: 200, description: 'Webhook processed' })
  async handleWebhook(@Body() webhook: WhatsAppWebhook) {
    return this.whatsappService.handleWebhook(webhook);
  }

  @Post('send/text')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a text message' })
  @ApiResponse({ status: 200, description: 'Message sent successfully' })
  async sendTextMessage(
    @Body() body: { to: string; message: string },
  ) {
    return this.whatsappService.sendTextMessage(body.to, body.message);
  }

  @Post('send/template')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a template message' })
  @ApiResponse({ status: 200, description: 'Template message sent successfully' })
  async sendTemplateMessage(
    @Body() body: {
      to: string;
      templateName: string;
      language?: string;
      parameters?: any[];
    },
  ) {
    return this.whatsappService.sendTemplateMessage(
      body.to,
      body.templateName,
      body.language || 'en',
      body.parameters || [],
    );
  }

  @Post('send/image')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send an image message' })
  @ApiResponse({ status: 200, description: 'Image sent successfully' })
  async sendImageMessage(
    @Body() body: { to: string; imageUrl: string; caption?: string },
  ) {
    return this.whatsappService.sendImageMessage(body.to, body.imageUrl, body.caption);
  }

  @Post('send/document')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a document message' })
  @ApiResponse({ status: 200, description: 'Document sent successfully' })
  async sendDocumentMessage(
    @Body() body: { to: string; documentUrl: string; caption?: string },
  ) {
    return this.whatsappService.sendDocumentMessage(body.to, body.documentUrl, body.caption);
  }

  @Post('send/bulk')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send bulk messages' })
  @ApiResponse({ status: 200, description: 'Bulk messages sent' })
  async sendBulkMessages(
    @Body() body: {
      recipients: string[];
      message: Omit<WhatsAppMessage, 'to'>;
    },
  ) {
    return this.whatsappService.sendBulkMessages(body.recipients, body.message);
  }

  @Get('groups')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get list of WhatsApp groups' })
  @ApiResponse({ status: 200, description: 'Groups retrieved successfully' })
  async getGroups() {
    return this.whatsappService.getGroups();
  }

  @Get('groups/:groupId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get WhatsApp group information and participants' })
  @ApiResponse({ status: 200, description: 'Group info retrieved successfully' })
  async getGroupInfo(@Query('groupId') groupId: string) {
    return this.whatsappService.getGroupInfo(groupId);
  }

  @Get('inbox')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get WhatsApp inbox (recent conversations from activities)' })
  @ApiResponse({ status: 200, description: 'Inbox messages' })
  async getInbox(@Req() req: any, @Query('limit') limit?: string) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    const activities = await this.whatsappService.getWhatsAppActivities(
      workspaceId,
      limit ? parseInt(limit, 10) : 50,
    );
    return { data: activities };
  }

  @Post('send')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a WhatsApp message to a phone number' })
  @ApiResponse({ status: 200, description: 'Message sent' })
  async sendTo(@Body() body: { to: string; message: string }) {
    return this.whatsappService.sendTextMessage(body.to, body.message);
  }
}
