import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Query,
  Param,
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

  @Post('send')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a WhatsApp text message' })
  @ApiResponse({ status: 200, description: 'Message sent' })
  async sendTo(@Req() req: any, @Body() body: { to: string; message: string }) {
    const result = await this.whatsappService.sendTextMessage(body.to, body.message);
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      await this.whatsappService.saveOutboundActivity(body.to, body.message, 'text', workspaceId, userId, msgId);
    }
    return result;
  }

  @Post('send/text')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a text message' })
  @ApiResponse({ status: 200, description: 'Message sent successfully' })
  async sendTextMessage(@Req() req: any, @Body() body: { to: string; message: string }) {
    const result = await this.whatsappService.sendTextMessage(body.to, body.message);
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      await this.whatsappService.saveOutboundActivity(body.to, body.message, 'text', workspaceId, userId, msgId);
    }
    return result;
  }

  @Post('send/template')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a template message' })
  @ApiResponse({ status: 200, description: 'Template message sent successfully' })
  async sendTemplateMessage(
    @Req() req: any,
    @Body() body: {
      to: string;
      templateName: string;
      language?: string;
      parameters?: any[];
    },
  ) {
    const result = await this.whatsappService.sendTemplateMessage(
      body.to,
      body.templateName,
      body.language || 'en',
      body.parameters || [],
    );
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      await this.whatsappService.saveOutboundActivity(
        body.to, `[Template: ${body.templateName}]`, 'template', workspaceId, userId, msgId,
      );
    }
    return result;
  }

  @Post('send/image')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send an image message' })
  @ApiResponse({ status: 200, description: 'Image sent successfully' })
  async sendImageMessage(@Req() req: any, @Body() body: { to: string; imageUrl: string; caption?: string }) {
    const result = await this.whatsappService.sendImageMessage(body.to, body.imageUrl, body.caption);
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      await this.whatsappService.saveOutboundActivity(
        body.to, `[Image] ${body.caption || ''}`.trim(), 'image', workspaceId, userId, msgId,
      );
    }
    return result;
  }

  @Post('send/document')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a document message' })
  @ApiResponse({ status: 200, description: 'Document sent successfully' })
  async sendDocumentMessage(
    @Req() req: any,
    @Body() body: { to: string; documentUrl: string; caption?: string; filename?: string },
  ) {
    const result = await this.whatsappService.sendDocumentMessage(body.to, body.documentUrl, body.caption, body.filename);
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      await this.whatsappService.saveOutboundActivity(
        body.to, `[Document: ${body.filename || 'file'}] ${body.caption || ''}`.trim(), 'document', workspaceId, userId, msgId,
      );
    }
    return result;
  }

  @Post('send/video')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a video message (MP4/3GPP, max 16MB)' })
  @ApiResponse({ status: 200, description: 'Video sent successfully' })
  async sendVideoMessage(@Req() req: any, @Body() body: { to: string; videoUrl: string; caption?: string }) {
    const result = await this.whatsappService.sendVideoMessage(body.to, body.videoUrl, body.caption);
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      await this.whatsappService.saveOutboundActivity(
        body.to, `[Video] ${body.caption || ''}`.trim(), 'video', workspaceId, userId, msgId,
      );
    }
    return result;
  }

  @Post('send/buttons')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send interactive button message (max 3 buttons, 20 char titles)' })
  @ApiResponse({ status: 200, description: 'Interactive message sent' })
  async sendButtons(
    @Req() req: any,
    @Body() body: {
      to: string;
      body: string;
      buttons: Array<{ id: string; title: string }>;
      header?: string;
      footer?: string;
    },
  ) {
    const result = await this.whatsappService.sendInteractiveButtons(
      body.to, body.body, body.buttons, body.header, body.footer,
    );
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      const btnLabels = body.buttons.map(b => b.title).join(', ');
      await this.whatsappService.saveOutboundActivity(
        body.to, `[Buttons: ${btnLabels}] ${body.body}`, 'interactive', workspaceId, userId, msgId,
      );
    }
    return result;
  }

  @Post('send/list')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send interactive list message (menu with sections)' })
  @ApiResponse({ status: 200, description: 'List message sent' })
  async sendList(
    @Req() req: any,
    @Body() body: {
      to: string;
      body: string;
      buttonText: string;
      sections: Array<{ title: string; rows: Array<{ id: string; title: string; description?: string }> }>;
      header?: string;
      footer?: string;
    },
  ) {
    const result = await this.whatsappService.sendInteractiveList(
      body.to, body.body, body.buttonText, body.sections, body.header, body.footer,
    );
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      await this.whatsappService.saveOutboundActivity(
        body.to, `[List menu] ${body.body}`, 'interactive', workspaceId, userId, msgId,
      );
    }
    return result;
  }

  @Post('send/bulk')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get list of WhatsApp groups' })
  @ApiResponse({ status: 200, description: 'Groups retrieved successfully' })
  async getGroups() {
    return this.whatsappService.getGroups();
  }

  @Get('groups/:groupId')
  @UseGuards(JwtAuthGuard)
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

  @Get('limits')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get WhatsApp Business API limits and pricing info' })
  @ApiResponse({ status: 200, description: 'API limits' })
  async getLimits() {
    return this.whatsappService.getApiLimits();
  }

  @Get('setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get WhatsApp webhook setup configuration' })
  @ApiResponse({ status: 200, description: 'Webhook setup info' })
  async getSetupInfo(@Req() req: any) {
    const appUrl = process.env.APP_URL || 'https://slackcrm-backend.fly.dev';
    const workspaceId = req.user?.workspaceId;
    return this.whatsappService.getWebhookSetupInfo(appUrl, workspaceId);
  }

  @Post('setup/verify-token')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Set a custom verify token for this workspace (save before entering in Meta)' })
  @ApiResponse({ status: 200, description: 'Token saved' })
  async setVerifyToken(@Req() req: any, @Body() body: { token: string }) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    await this.whatsappService.setVerifyToken(workspaceId, body.token);
    return { success: true };
  }

  @Get('auto-send')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get auto-send config (WhatsApp template on new contact creation)' })
  @ApiResponse({ status: 200, description: 'Auto-send config' })
  async getAutoSend(@Req() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    return this.whatsappService.getAutoSend(workspaceId);
  }

  @Post('auto-send')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save auto-send config (send WhatsApp template on new contact creation)' })
  @ApiResponse({ status: 200, description: 'Saved' })
  async saveAutoSend(
    @Req() req: any,
    @Body() body: {
      enabled: boolean;
      templateName: string;
      language?: string;
      includeNameParam?: boolean;
      conditions?: { sources?: string[]; statuses?: string[]; requirePhone?: boolean };
    },
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    await this.whatsappService.saveAutoSend(workspaceId, body);
    return { success: true };
  }

  @Get('auto-responses')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get auto-response rules for this workspace' })
  @ApiResponse({ status: 200, description: 'Auto-response config' })
  async getAutoResponses(@Req() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    return this.whatsappService.getAutoResponses(workspaceId);
  }

  @Post('auto-responses')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save auto-response rules for this workspace' })
  @ApiResponse({ status: 200, description: 'Saved' })
  async saveAutoResponses(
    @Req() req: any,
    @Body() body: { enabled: boolean; rules: Array<{ keywords: string[]; response: string; enabled: boolean; name?: string }> },
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    await this.whatsappService.saveAutoResponses(workspaceId, body.enabled, body.rules);
    return { success: true };
  }

  @Get('templates')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List approved message templates from Meta' })
  @ApiResponse({ status: 200, description: 'Template list' })
  async listTemplates(@Req() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    const templates = await this.whatsappService.listTemplates(workspaceId);
    return { data: templates };
  }

  @Post('templates')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create and submit a message template to Meta for approval' })
  @ApiResponse({ status: 200, description: 'Template created' })
  async createTemplate(
    @Req() req: any,
    @Body() body: {
      name: string;
      language: string;
      category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
      headerText?: string;
      bodyText: string;
      footerText?: string;
      buttons?: Array<{ type: 'QUICK_REPLY' | 'URL' | 'PHONE_NUMBER'; text: string; url?: string; phoneNumber?: string }>;
    },
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    return this.whatsappService.createTemplate(workspaceId, body);
  }

  @Delete('templates/:name')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a message template from Meta' })
  @ApiResponse({ status: 200, description: 'Template deleted' })
  async deleteTemplate(@Req() req: any, @Param('name') templateName: string) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    return this.whatsappService.deleteTemplate(workspaceId, templateName);
  }

  @Post('broadcast')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Broadcast an approved template to contacts matching a filter' })
  @ApiResponse({ status: 200, description: 'Broadcast results' })
  async broadcast(
    @Req() req: any,
    @Body() body: {
      filter: { tags?: string[]; status?: string[]; source?: string[] };
      template: { name: string; language: string; params?: any[] };
    },
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    return this.whatsappService.broadcastTemplate(workspaceId, body.filter || {}, body.template);
  }

  @Post('bulk/csv-import')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Import contacts from CSV rows and optionally send a template' })
  @ApiResponse({ status: 200, description: 'Import results' })
  async csvImport(
    @Req() req: any,
    @Body() body: {
      rows: Array<{ phone: string; firstName?: string; lastName?: string; tags?: string[] }>;
      addTags?: string[];
      sendTemplate?: { name: string; language: string; params?: any[] };
    },
  ) {
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    if (!body.rows?.length) throw new BadRequestException('rows array is required');
    return this.whatsappService.csvImportAndSend(workspaceId, userId, body.rows, {
      addTags: body.addTags,
      sendTemplate: body.sendTemplate,
    });
  }

  @Get('assignments')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get conversation assignments for this workspace' })
  @ApiResponse({ status: 200, description: 'Assignment map { [waId]: { userId, userName, color, assignedAt } }' })
  async getAssignments(@Req() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    const data = await this.whatsappService.getConversationAssignments(workspaceId);
    return { data };
  }

  @Delete('conversation/:waId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete all messages in a conversation (remove from inbox)' })
  @ApiResponse({ status: 200, description: 'Conversation deleted' })
  async deleteConversation(@Req() req: any, @Param('waId') waId: string) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    return this.whatsappService.deleteConversation(workspaceId, waId);
  }

  @Post('conversations/:waId/assign')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Assign a user to a conversation (or unassign with null)' })
  @ApiResponse({ status: 200, description: 'Assignment saved' })
  async assignConversation(
    @Req() req: any,
    @Param('waId') waId: string,
    @Body() body: { userId: string | null; userName: string; color: string } | null,
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    await this.whatsappService.assignConversation(workspaceId, waId, body);
    return { success: true };
  }
}
