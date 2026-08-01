import { Controller, Get, Post, Body, Param, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Sse } from '@nestjs/common';
import { Observable, fromEvent, interval, merge } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WhatsAppCallingService } from './whatsapp-calling.service';

@ApiTags('WhatsApp Calling')
@Controller('integrations/whatsapp/calls')
export class WhatsAppCallingController {
  constructor(
    private readonly callingService: WhatsAppCallingService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @Get('enable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable Cloud API Calling for this workspace\'s WhatsApp number (idempotent)' })
  async enable(@Req() req: any) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    return this.callingService.ensureCallingEnabled(workspaceId);
  }

  @Post('permission-request')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ask a contact for permission to call them' })
  async requestPermission(@Req() req: any, @Body() body: { waId: string }) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    await this.callingService.requestCallPermission(workspaceId, body.waId);
    return { success: true };
  }

  @Get('permission-status/:waId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check whether a contact has granted calling permission' })
  async permissionStatus(@Req() req: any, @Param('waId') waId: string) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    return this.callingService.getCallPermissionStatus(workspaceId, waId);
  }

  @Post('initiate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Place an outbound call with a client-generated SDP offer' })
  @ApiResponse({ status: 200, description: 'Call accepted by Meta; SDP answer arrives later over the call event stream' })
  async initiate(@Req() req: any, @Body() body: { waId: string; sdpOffer: string }) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    return this.callingService.initiateCall(workspaceId, body.waId, body.sdpOffer);
  }

  @Post(':callId/terminate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'End an in-progress or ringing call' })
  async terminate(@Req() req: any, @Param('callId') callId: string) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId) throw new BadRequestException('Workspace ID required');
    await this.callingService.terminateCall(workspaceId, callId);
    return { success: true };
  }

  // Live call events (SDP answers, ringing/rejected/terminated status) as
  // Server-Sent Events. EventSource can't set headers, so the JWT is passed
  // as ?token= — see JwtStrategy's query extractor, same pattern as the
  // Meta Inbox stream.
  @Sse('stream')
  @UseGuards(JwtAuthGuard)
  stream(@Req() req: any): Observable<MessageEvent> {
    const workspaceId = req.user.workspaceId;
    const events$ = fromEvent(this.eventEmitter, WhatsAppCallingService.CALL_EVENT).pipe(
      filter((payload: any) => payload?.workspaceId === workspaceId),
      map((payload: any) => ({ data: payload }) as MessageEvent),
    );
    const heartbeat$ = interval(25000).pipe(
      map(() => ({ type: 'ping', data: { ts: Date.now() } }) as MessageEvent),
    );
    return merge(events$, heartbeat$);
  }
}
