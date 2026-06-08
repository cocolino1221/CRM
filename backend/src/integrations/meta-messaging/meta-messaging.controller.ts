import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Sse,
  MessageEvent,
  UseGuards,
  UseInterceptors,
  UploadedFiles,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import { Observable, fromEvent, interval, merge } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { MetaMessagingService, MetaChannel } from './meta-messaging.service';

const audioUploadInterceptor = AnyFilesInterceptor({
  storage: diskStorage({
    destination: tmpdir(),
    filename: (_req, file, cb) => {
      const safe = String(file.originalname || 'audio.bin').replace(/[^a-zA-Z0-9._-]/g, '_');
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safe}`);
    },
  }),
  limits: { fileSize: 32 * 1024 * 1024 },
});

@ApiTags('Meta Messaging')
@Controller('integrations/meta-messaging')
export class MetaMessagingController {
  constructor(
    private readonly metaMessagingService: MetaMessagingService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Public()
  @Get('webhook/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify shared Messenger/Instagram webhook for a provider' })
  async verifyProviderWebhook(
    @Param('provider') provider: 'facebook' | 'instagram',
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const result = await this.metaMessagingService.verifyProviderWebhookToken(
      provider,
      mode,
      token,
      challenge,
    );

    if (result) return result;
    throw new BadRequestException('Webhook verification failed');
  }

  @Public()
  @Get('webhook/:provider/:integrationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify Messenger/Instagram webhook for a specific integration' })
  async verifyWebhook(
    @Param('provider') provider: 'facebook' | 'instagram',
    @Param('integrationId') integrationId: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const result = await this.metaMessagingService.verifyWebhookToken(
      provider,
      integrationId,
      mode,
      token,
      challenge,
    );

    if (result) return result;
    throw new BadRequestException('Webhook verification failed');
  }

  @Public()
  @Post('webhook/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive shared Messenger/Instagram webhook events' })
  async receiveProviderWebhook(
    @Param('provider') provider: 'facebook' | 'instagram',
    @Body() payload: any,
  ) {
    return this.metaMessagingService.handleProviderWebhook(provider, payload);
  }

  @Public()
  @Post('webhook/:provider/:integrationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive Messenger/Instagram webhook events' })
  async receiveWebhook(
    @Param('provider') provider: 'facebook' | 'instagram',
    @Param('integrationId') integrationId: string,
    @Body() payload: any,
  ) {
    return this.metaMessagingService.handleWebhook(provider, integrationId, payload);
  }

  @Get('setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get webhook setup info for connected Meta integrations' })
  async getSetupInfo(@Req() req: any) {
    return this.metaMessagingService.getSetupInfo(req.user.workspaceId);
  }

  @Get('accounts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List connected Messenger/Instagram accounts for the workspace' })
  async getAccounts(@Req() req: any, @Query('refresh') refresh?: string) {
    return this.metaMessagingService.getAccounts(req.user.workspaceId, refresh === '1');
  }

  @Get('inbox')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get Messenger/Instagram inbox conversations' })
  async getInbox(@Req() req: any, @Query('channel') channel?: MetaChannel) {
    return this.metaMessagingService.getInbox(req.user.workspaceId, channel);
  }

  // Live inbox stream (Server-Sent Events). EventSource can't set headers, so
  // the JWT is passed as ?token= (see JwtStrategy query extractor). Pushes only
  // on real webhook/send events — zero DB polling.
  @Sse('stream')
  @UseGuards(JwtAuthGuard)
  stream(@Req() req: any): Observable<MessageEvent> {
    const workspaceId = req.user.workspaceId;
    const events$ = fromEvent(this.eventEmitter, MetaMessagingService.STREAM_EVENT).pipe(
      filter((payload: any) => payload?.workspaceId === workspaceId),
      map((payload: any) => ({ data: payload }) as MessageEvent),
    );
    // Heartbeat so proxies (Fly) keep the connection open while idle.
    const heartbeat$ = interval(25000).pipe(
      map(() => ({ type: 'ping', data: { ts: Date.now() } }) as MessageEvent),
    );
    return merge(events$, heartbeat$);
  }

  @Delete('inbox/conversation')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete an entire Messenger/Instagram conversation' })
  async deleteConversation(
    @Req() req: any,
    @Body() body: { channel: MetaChannel; externalUserId: string; integrationId?: string },
  ) {
    return this.metaMessagingService.deleteConversation(req.user.workspaceId, body);
  }

  @Delete('inbox/message/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a single Messenger/Instagram message' })
  async deleteMessage(@Req() req: any, @Param('id') id: string) {
    return this.metaMessagingService.deleteMessage(req.user.workspaceId, id);
  }

  @Post('contacts/ensure')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create or link a CRM contact for a Messenger/Instagram conversation' })
  async ensureContact(
    @Req() req: any,
    @Body() body: {
      channel: MetaChannel;
      externalUserId: string;
      senderName?: string;
      integrationId?: string;
    },
  ) {
    return this.metaMessagingService.ensureConversationContact(req.user.workspaceId, req.user.id, body);
  }

  @Post('send/text')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a text message to Messenger or Instagram' })
  @ApiResponse({ status: 200, description: 'Message sent or simulated successfully' })
  async sendText(
    @Req() req: any,
    @Body() body: {
      channel: MetaChannel;
      to: string;
      message: string;
      integrationId?: string;
      simulate?: boolean;
    },
  ): Promise<any> {
    return this.metaMessagingService.sendTextMessage(req.user.workspaceId, req.user.id, body);
  }

  @Post('send/audio')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send an audio message to Messenger or Instagram' })
  @ApiResponse({ status: 200, description: 'Audio sent or simulated successfully' })
  async sendAudio(
    @Req() req: any,
    @Body() body: {
      channel: MetaChannel;
      to: string;
      audioUrl: string;
      attachmentName?: string;
      integrationId?: string;
      simulate?: boolean;
    },
  ): Promise<any> {
    return this.metaMessagingService.sendAudioMessage(req.user.workspaceId, req.user.id, body);
  }

  @Get('audio-templates')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List saved audio templates for Messenger' })
  async listAudioTemplates(
    @Req() req: any,
    @Query('channel') channel?: MetaChannel,
    @Query('integrationId') integrationId?: string,
  ) {
    return this.metaMessagingService.listAudioTemplates(
      req.user.workspaceId,
      channel || 'messenger',
      integrationId,
    );
  }

  @Post('audio-templates')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(audioUploadInterceptor)
  @ApiOperation({ summary: 'Upload an audio clip and save it as a reusable template' })
  async createAudioTemplate(
    @Req() req: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { name?: string; channel?: MetaChannel; integrationId?: string },
  ) {
    const file = files?.[0];
    if (!file) throw new BadRequestException('Audio file is required');
    return this.metaMessagingService.createAudioTemplate(req.user.workspaceId, body, {
      path: file.path,
      mimetype: file.mimetype,
      originalname: file.originalname,
    });
  }

  @Delete('audio-templates/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a saved audio template' })
  async deleteAudioTemplate(
    @Req() req: any,
    @Param('id') id: string,
    @Query('integrationId') integrationId?: string,
  ) {
    return this.metaMessagingService.deleteAudioTemplate(req.user.workspaceId, id, integrationId);
  }

  @Post('send/audio-template')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Send a saved audio template to Messenger' })
  async sendAudioTemplate(
    @Req() req: any,
    @Body() body: {
      channel?: MetaChannel;
      to: string;
      templateId: string;
      integrationId?: string;
      simulate?: boolean;
    },
  ) {
    return this.metaMessagingService.sendAudioTemplate(req.user.workspaceId, req.user.id, body);
  }

  @Post('send/audio-file')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(audioUploadInterceptor)
  @ApiOperation({ summary: 'Upload + send an audio clip to Messenger as a playable message (no template saved)' })
  async sendAudioFile(
    @Req() req: any,
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { channel?: MetaChannel; to: string; integrationId?: string; simulate?: boolean },
  ) {
    const file = files?.[0];
    if (!file) throw new BadRequestException('Audio file is required');
    return this.metaMessagingService.sendAudioFile(req.user.workspaceId, req.user.id, body, {
      path: file.path,
      mimetype: file.mimetype,
      originalname: file.originalname,
    });
  }

  @Post('simulate/inbound')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a simulated inbound Messenger/Instagram message for local testing' })
  async simulateInbound(
    @Req() req: any,
    @Body() body: {
      channel: MetaChannel;
      from: string;
      senderName?: string;
      text?: string;
      audioUrl?: string;
      attachmentName?: string;
      integrationId?: string;
    },
  ) {
    return this.metaMessagingService.simulateInbound(req.user.workspaceId, req.user.id, body);
  }
}
