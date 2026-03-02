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
  UseInterceptors,
  UploadedFiles,
  StreamableFile,
  Res,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { WhatsAppService, WhatsAppMessage, WhatsAppWebhook } from './whatsapp.service';
import { WhatsAppAIService } from './whatsapp-ai.service';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Response } from 'express';
import { tmpdir } from 'os';
import { normalizePhoneDigits } from '../../common/utils/phone.util';

@ApiTags('WhatsApp Business')
@Controller('integrations/whatsapp')
export class WhatsAppController {
  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly whatsappAIService: WhatsAppAIService,
  ) {}

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
  async sendTo(@Req() req: any, @Body() body: { to: string; message: string; integrationId?: string }) {
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    const sent = workspaceId
      ? await this.whatsappService.sendMessageForWorkspace(workspaceId, {
        to: body.to,
        type: 'text',
        content: body.message,
      }, body.integrationId)
      : { result: await this.whatsappService.sendTextMessage(body.to, body.message), sender: {} };

    const result = sent.result;
    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      await this.whatsappService.saveOutboundActivity(
        body.to,
        body.message,
        'text',
        workspaceId,
        userId,
        msgId,
        sent.sender,
      );
    }
    return result;
  }

  @Post('send/text')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a text message' })
  @ApiResponse({ status: 200, description: 'Message sent successfully' })
  async sendTextMessage(@Req() req: any, @Body() body: { to: string; message: string; integrationId?: string }) {
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    const sent = workspaceId
      ? await this.whatsappService.sendMessageForWorkspace(workspaceId, {
        to: body.to,
        type: 'text',
        content: body.message,
      }, body.integrationId)
      : { result: await this.whatsappService.sendTextMessage(body.to, body.message), sender: {} };

    const result = sent.result;
    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      await this.whatsappService.saveOutboundActivity(
        body.to,
        body.message,
        'text',
        workspaceId,
        userId,
        msgId,
        sent.sender,
      );
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
      headerMediaType?: 'image' | 'video' | 'document';
      headerMediaId?: string;
      headerMediaUrl?: string;
      integrationId?: string;
    },
  ) {
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    const components: any[] = [...(body.parameters || [])];

    const headerType = String(body.headerMediaType || '').toLowerCase();
    const headerMediaId = String(body.headerMediaId || '').trim();
    const headerMediaUrl = String(body.headerMediaUrl || '').trim();
    if (['image', 'video', 'document'].includes(headerType) && (headerMediaId || headerMediaUrl)) {
      const headerParam: any = { type: headerType };
      headerParam[headerType] = headerMediaId ? { id: headerMediaId } : { link: headerMediaUrl };
      components.unshift({ type: 'header', parameters: [headerParam] });
    }

    const sent = workspaceId
      ? await this.whatsappService.sendMessageForWorkspace(workspaceId, {
        to: body.to,
        type: 'template',
        content: '',
        template: {
          name: body.templateName,
          language: body.language || 'en',
          parameters: components,
        },
      }, body.integrationId)
      : {
        result: await this.whatsappService.sendTemplateMessage(
          body.to,
          body.templateName,
          body.language || 'en',
          components,
        ),
        sender: {},
      };

    const result = sent.result;

    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      await this.whatsappService.saveOutboundActivity(
        body.to,
        `[Template: ${body.templateName}]`,
        'template',
        workspaceId,
        userId,
        msgId,
        {
          ...sent.sender,
          mediaType: ['image', 'video', 'document'].includes(headerType) ? headerType : undefined,
          mediaId: headerMediaId || undefined,
          mediaUrl: headerMediaUrl || undefined,
        },
      );
    }
    return result;
  }

  @Post('send/image')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send an image message (by URL or uploaded media_id)' })
  @ApiResponse({ status: 200, description: 'Image sent successfully' })
  async sendImageMessage(
    @Req() req: any,
    @Body() body: { to: string; imageUrl?: string; imageId?: string; caption?: string; integrationId?: string },
  ) {
    if (!body.imageUrl && !body.imageId) {
      throw new BadRequestException('imageUrl or imageId is required');
    }
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    const sent = workspaceId
      ? await this.whatsappService.sendMessageForWorkspace(workspaceId, {
        to: body.to,
        type: 'image',
        content: '',
        media: {
          url: body.imageUrl,
          id: body.imageId,
          caption: body.caption,
        },
      }, body.integrationId)
      : {
        result: await this.whatsappService.sendMessage({
          to: body.to,
          type: 'image',
          content: '',
          media: {
            url: body.imageUrl,
            id: body.imageId,
            caption: body.caption,
          },
        }),
        sender: {},
      };
    const result = sent.result;
    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      await this.whatsappService.saveOutboundActivity(
        body.to,
        `[Image] ${body.caption || ''}`.trim(),
        'image',
        workspaceId,
        userId,
        msgId,
        {
          ...sent.sender,
          mediaId: body.imageId || undefined,
          mediaUrl: body.imageUrl || undefined,
          mediaCaption: body.caption || undefined,
        },
      );
    }
    return result;
  }

  @Post('send/document')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a document message (by URL or uploaded media_id)' })
  @ApiResponse({ status: 200, description: 'Document sent successfully' })
  async sendDocumentMessage(
    @Req() req: any,
    @Body() body: { to: string; documentUrl?: string; documentId?: string; caption?: string; filename?: string; integrationId?: string },
  ) {
    if (!body.documentUrl && !body.documentId) {
      throw new BadRequestException('documentUrl or documentId is required');
    }
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    const sent = workspaceId
      ? await this.whatsappService.sendMessageForWorkspace(workspaceId, {
        to: body.to,
        type: 'document',
        content: '',
        media: {
          url: body.documentUrl,
          id: body.documentId,
          caption: body.caption,
          filename: body.filename,
        },
      }, body.integrationId)
      : {
        result: await this.whatsappService.sendMessage({
          to: body.to,
          type: 'document',
          content: '',
          media: {
            url: body.documentUrl,
            id: body.documentId,
            caption: body.caption,
            filename: body.filename,
          },
        }),
        sender: {},
      };
    const result = sent.result;
    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      await this.whatsappService.saveOutboundActivity(
        body.to,
        `[Document: ${body.filename || 'file'}] ${body.caption || ''}`.trim(),
        'document',
        workspaceId,
        userId,
        msgId,
        {
          ...sent.sender,
          mediaId: body.documentId || undefined,
          mediaUrl: body.documentUrl || undefined,
          mediaCaption: body.caption || undefined,
          fileName: body.filename || undefined,
        },
      );
    }
    return result;
  }

  @Post('send/video')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a video message (URL or uploaded media_id)' })
  @ApiResponse({ status: 200, description: 'Video sent successfully' })
  async sendVideoMessage(
    @Req() req: any,
    @Body() body: { to: string; videoUrl?: string; videoId?: string; caption?: string; integrationId?: string },
  ) {
    if (!body.videoUrl && !body.videoId) {
      throw new BadRequestException('videoUrl or videoId is required');
    }
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    const sent = workspaceId
      ? await this.whatsappService.sendMessageForWorkspace(workspaceId, {
        to: body.to,
        type: 'video',
        content: '',
        media: {
          url: body.videoUrl,
          id: body.videoId,
          caption: body.caption,
        },
      }, body.integrationId)
      : {
        result: await this.whatsappService.sendMessage({
          to: body.to,
          type: 'video',
          content: '',
          media: {
            url: body.videoUrl,
            id: body.videoId,
            caption: body.caption,
          },
        }),
        sender: {},
      };
    const result = sent.result;
    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      await this.whatsappService.saveOutboundActivity(
        body.to,
        `[Video] ${body.caption || ''}`.trim(),
        'video',
        workspaceId,
        userId,
        msgId,
        {
          ...sent.sender,
          mediaId: body.videoId || undefined,
          mediaUrl: body.videoUrl || undefined,
          mediaCaption: body.caption || undefined,
        },
      );
    }
    return result;
  }

  @Post('send/audio')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send an audio message (URL or uploaded media_id)' })
  @ApiResponse({ status: 200, description: 'Audio sent successfully' })
  async sendAudioMessage(
    @Req() req: any,
    @Body() body: { to: string; audioUrl?: string; audioId?: string; integrationId?: string },
  ) {
    if (!body.audioUrl && !body.audioId) {
      throw new BadRequestException('audioUrl or audioId is required');
    }
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    const sent = workspaceId
      ? await this.whatsappService.sendMessageForWorkspace(workspaceId, {
        to: body.to,
        type: 'audio',
        content: '',
        media: {
          url: body.audioUrl,
          id: body.audioId,
        },
      }, body.integrationId)
      : {
        result: await this.whatsappService.sendMessage({
          to: body.to,
          type: 'audio',
          content: '',
          media: {
            url: body.audioUrl,
            id: body.audioId,
          },
        }),
        sender: {},
      };
    const result = sent.result;
    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      await this.whatsappService.saveOutboundActivity(
        body.to,
        '[Voice message]',
        'audio',
        workspaceId,
        userId,
        msgId,
        {
          ...sent.sender,
          mediaId: body.audioId || undefined,
          mediaUrl: body.audioUrl || undefined,
        },
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
      integrationId?: string;
    },
  ) {
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    const sent = workspaceId
      ? await this.whatsappService.sendMessageForWorkspace(workspaceId, {
        to: body.to,
        type: 'interactive',
        content: '',
        interactive: {
          type: 'button',
          ...(body.header ? { header: { type: 'text', text: body.header } } : {}),
          body: { text: body.body },
          ...(body.footer ? { footer: { text: body.footer } } : {}),
          action: {
            buttons: (body.buttons || []).slice(0, 3).map(b => ({
              type: 'reply',
              reply: { id: b.id, title: String(b.title || '').slice(0, 20) },
            })),
          },
        },
      }, body.integrationId)
      : {
        result: await this.whatsappService.sendInteractiveButtons(
          body.to, body.body, body.buttons, body.header, body.footer,
        ),
        sender: {},
      };
    const result = sent.result;
    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      const btnLabels = body.buttons.map(b => b.title).join(', ');
      await this.whatsappService.saveOutboundActivity(
        body.to,
        `[Buttons: ${btnLabels}] ${body.body}`,
        'interactive',
        workspaceId,
        userId,
        msgId,
        sent.sender,
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
      integrationId?: string;
    },
  ) {
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    const sent = workspaceId
      ? await this.whatsappService.sendMessageForWorkspace(workspaceId, {
        to: body.to,
        type: 'interactive',
        content: '',
        interactive: {
          type: 'list',
          ...(body.header ? { header: { type: 'text', text: body.header } } : {}),
          body: { text: body.body },
          ...(body.footer ? { footer: { text: body.footer } } : {}),
          action: {
            button: body.buttonText,
            sections: body.sections,
          },
        },
      }, body.integrationId)
      : {
        result: await this.whatsappService.sendInteractiveList(
          body.to, body.body, body.buttonText, body.sections, body.header, body.footer,
        ),
        sender: {},
      };
    const result = sent.result;
    if (workspaceId && userId) {
      const msgId = result?.messages?.[0]?.id;
      await this.whatsappService.saveOutboundActivity(
        body.to,
        `[List menu] ${body.body}`,
        'interactive',
        workspaceId,
        userId,
        msgId,
        sent.sender,
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

  @Get('accounts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List connected WhatsApp sender numbers for current workspace' })
  @ApiResponse({ status: 200, description: 'Connected WhatsApp accounts' })
  async getAccounts(@Req() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    return this.whatsappService.listWorkspaceAccounts(workspaceId);
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

  @Get('diagnostic')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Diagnostic check — shows integration status and Meta checklist' })
  @ApiResponse({ status: 200, description: 'Diagnostic info' })
  async getDiagnostic(@Req() req: any) {
    const workspaceId = req.user?.workspaceId;
    return this.whatsappService.getDiagnostic(workspaceId);
  }

  @Get('test-verification')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test webhook verification — calls the public endpoint internally to verify it works' })
  @ApiResponse({ status: 200, description: 'Test result' })
  async testVerification(@Req() req: any) {
    const appUrl = process.env.APP_URL || 'https://slackcrm-backend.fly.dev';
    const workspaceId = req.user?.workspaceId;
    return this.whatsappService.testVerification(appUrl, workspaceId);
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
      headerMediaType?: 'image' | 'video' | 'document';
      headerMediaId?: string;
      headerMediaUrl?: string;
      conditions?: { sources?: string[]; statuses?: string[]; typeformFormIds?: string[]; requirePhone?: boolean };
      autoSendRules?: Array<{
        id?: string;
        name?: string;
        enabled: boolean;
        templateName: string;
        language?: string;
        includeNameParam?: boolean;
        headerMediaType?: 'image' | 'video' | 'document';
        headerMediaId?: string;
        headerMediaUrl?: string;
        priority?: number;
        conditions?: { sources?: string[]; statuses?: string[]; typeformFormIds?: string[]; requirePhone?: boolean };
      }>;
      rules?: Array<{
        id?: string;
        name?: string;
        enabled: boolean;
        templateName: string;
        language?: string;
        includeNameParam?: boolean;
        headerMediaType?: 'image' | 'video' | 'document';
        headerMediaId?: string;
        headerMediaUrl?: string;
        priority?: number;
        conditions?: { sources?: string[]; statuses?: string[]; typeformFormIds?: string[]; requirePhone?: boolean };
      }>;
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
      filter: { tags?: string[]; status?: string[]; source?: string[]; selectedContactIds?: string[] };
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

  @Get('conversations/state')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get persisted conversation state (archive/read markers)' })
  @ApiResponse({ status: 200, description: 'Conversation state maps' })
  async getConversationState(@Req() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    const data = await this.whatsappService.getConversationState(workspaceId);
    return { data };
  }

  @Post('conversations/:waId/archive')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Archive or unarchive a conversation' })
  @ApiResponse({ status: 200, description: 'Conversation archive state updated' })
  async setConversationArchived(
    @Req() req: any,
    @Param('waId') waId: string,
    @Body() body: { archived?: boolean } | null,
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    const normalizedWaId = normalizePhoneDigits(waId);
    if (!normalizedWaId) throw new BadRequestException('Invalid conversation id');
    await this.whatsappService.setConversationArchived(workspaceId, normalizedWaId, body?.archived !== false);
    return { success: true };
  }

  @Post('conversations/:waId/read')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Mark conversation as read/unread' })
  @ApiResponse({ status: 200, description: 'Conversation read state updated' })
  async setConversationReadState(
    @Req() req: any,
    @Param('waId') waId: string,
    @Body() body: { read?: boolean } | null,
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    const normalizedWaId = normalizePhoneDigits(waId);
    if (!normalizedWaId) throw new BadRequestException('Invalid conversation id');
    await this.whatsappService.setConversationReadState(workspaceId, normalizedWaId, body?.read !== false);
    return { success: true };
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
    @Body() body: { userId?: string | null; userName?: string; color?: string } | null,
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');

    const normalizedAssignment = body?.userId
      ? {
          userId: body.userId,
          userName: body.userName?.trim() || 'Unknown User',
          color: body.color || '#6b7280',
        }
      : null;

    await this.whatsappService.assignConversation(workspaceId, waId, normalizedAssignment);
    return { success: true };
  }

  // ─── AI Auto-Reply ──────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('ai-config')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get AI auto-reply configuration' })
  async getAIConfig(@Req() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    return this.whatsappAIService.getConfig(workspaceId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('ai-config')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save AI auto-reply configuration' })
  async saveAIConfig(@Req() req: any, @Body() body: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    await this.whatsappAIService.saveConfig(workspaceId, body);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('ai-test')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test AI auto-reply with a sample message' })
  async testAIReply(@Req() req: any, @Body() body: { message: string }) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    if (!body.message?.trim()) throw new BadRequestException('Message required');
    return this.whatsappAIService.testReply(workspaceId, body.message);
  }

  // ─── Campaigns ─────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('campaigns')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all WhatsApp broadcast campaigns' })
  async listCampaigns(@Req() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    return this.whatsappService.getCampaigns(workspaceId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('campaigns')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new broadcast campaign' })
  async createCampaign(
    @Req() req: any,
    @Body() body: { name: string; templateName: string; language: string; filter?: any },
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    if (!body.name?.trim()) throw new BadRequestException('Campaign name required');
    if (!body.templateName?.trim()) throw new BadRequestException('Template name required');
    return this.whatsappService.createCampaign(workspaceId, {
      name: body.name.trim(),
      templateName: body.templateName.trim(),
      language: body.language?.trim() || 'en_US',
      filter: body.filter || {},
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('campaigns/:id/send')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a campaign immediately' })
  async sendCampaign(@Req() req: any, @Param('id') campaignId: string) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    return this.whatsappService.sendCampaign(workspaceId, campaignId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('campaigns/preview-audience')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Preview audience count for campaign filters' })
  async previewAudience(
    @Req() req: any,
    @Body() body: { tags?: string[]; status?: string[]; source?: string[]; selectedContactIds?: string[] },
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    return this.whatsappService.previewCampaignAudience(workspaceId, body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('campaigns/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a campaign' })
  async deleteCampaign(@Req() req: any, @Param('id') campaignId: string) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    await this.whatsappService.deleteCampaign(workspaceId, campaignId);
    return { success: true };
  }

  // ─── Meta Embedded Signup ──────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('embedded-signup-config')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Meta app ID and config URL for Embedded Signup' })
  async getEmbeddedSignupConfig() {
    return this.whatsappService.getEmbeddedSignupConfig();
  }

  @UseGuards(JwtAuthGuard)
  @Post('embedded-signup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Complete Meta Embedded Signup — exchange code for token and create integration' })
  async completeEmbeddedSignup(
    @Req() req: any,
    @Body() body: { code: string },
  ) {
    const workspaceId = req.user?.workspaceId;
    const userId = req.user?.id;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    if (!body.code?.trim()) throw new BadRequestException('Authorization code required');
    return this.whatsappService.completeEmbeddedSignup(workspaceId, userId, body.code.trim());
  }

  // ─── Conversation Flows (Chatbot) ─────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('flows')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get conversation flows for this workspace' })
  async getFlows(@Req() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    return this.whatsappService.getFlows(workspaceId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('flows')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Save conversation flows for this workspace' })
  async saveFlows(@Req() req: any, @Body() body: { flows: any[] }) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    await this.whatsappService.saveFlows(workspaceId, body.flows || []);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('flows/:flowId/test')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Test a flow by sending step 1 to a phone number' })
  async testFlow(
    @Req() req: any,
    @Param('flowId') flowId: string,
    @Body() body: { phone: string },
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    if (!body.phone?.trim()) throw new BadRequestException('Phone number required');
    return this.whatsappService.testFlow(workspaceId, flowId, body.phone.trim());
  }

  @UseGuards(JwtAuthGuard)
  @Post('media/upload')
  @ApiBearerAuth()
  @UseInterceptors(AnyFilesInterceptor({
    storage: diskStorage({
      destination: tmpdir(),
      filename: (_req, file, cb) => {
        const safeOriginal = String(file.originalname || 'upload.bin').replace(/[^a-zA-Z0-9._-]/g, '_');
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeOriginal}`);
      },
    }),
    limits: { fileSize: 64 * 1024 * 1024 },
  }))
  @ApiOperation({ summary: 'Upload media to WhatsApp (returns media_id for use in messages)' })
  @ApiResponse({ status: 200, description: 'Media uploaded, returns { id: media_id }' })
  async uploadMedia(
    @Req() req: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Query('integrationId') integrationId: string | undefined,
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    const file = files?.[0];
    if (!file) throw new BadRequestException('File is required');
    if (!file.path) throw new BadRequestException('Uploaded file path is missing');
    return this.whatsappService.uploadMedia(
      workspaceId,
      file.path,
      file.mimetype,
      file.originalname,
      integrationId?.trim() || undefined,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('media/:mediaId/file')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Proxy WhatsApp media content by media_id' })
  @ApiResponse({ status: 200, description: 'Binary media stream' })
  async getMediaFile(
    @Req() req: any,
    @Param('mediaId') mediaId: string,
    @Res({ passthrough: true }) res: Response,
    @Query('integrationId') integrationId: string | undefined,
  ) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    if (!mediaId?.trim()) throw new BadRequestException('mediaId is required');

    const media = await this.whatsappService.downloadMediaForWorkspace(
      workspaceId,
      mediaId.trim(),
      integrationId?.trim() || undefined,
    );
    res.setHeader('Content-Type', media.contentType || 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, max-age=300');
    if (media.fileName) {
      res.setHeader('Content-Disposition', `inline; filename="${media.fileName.replace(/"/g, '')}"`);
    }
    return new StreamableFile(media.buffer);
  }
}
