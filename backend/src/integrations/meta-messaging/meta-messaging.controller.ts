import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';
import { MetaMessagingService, MetaChannel } from './meta-messaging.service';

@ApiTags('Meta Messaging')
@Controller('integrations/meta-messaging')
export class MetaMessagingController {
  constructor(private readonly metaMessagingService: MetaMessagingService) {}

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
