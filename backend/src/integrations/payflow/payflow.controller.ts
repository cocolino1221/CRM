import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PayflowService } from './payflow.service';
import { PayflowSyncDto } from './payflow-sync.dto';

@ApiTags('Payflow')
@Controller('integrations/payflow')
export class PayflowController {
  constructor(private readonly payflowService: PayflowService) {}

  // ── CRM UI (logged-in user) ───────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('status')
  @ApiOperation({ summary: 'Payflow connection status for the current workspace' })
  status(@Req() req: any) {
    return this.payflowService.status(req.user.workspaceId);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('connect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create or rotate the connection key to paste into Payflow (shown once)' })
  connect(@Req() req: any) {
    return this.payflowService.connect(req.user.workspaceId, req.user.id);
  }

  // ── Called by Payflow with the connection key ─────────────────────────────

  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Payflow: verify the connection key' })
  async health(@Headers('authorization') authorization?: string) {
    const integration = await this.payflowService.authenticate(authorization);
    return { ok: true, workspaceId: integration.workspaceId };
  }

  @Public()
  @Get('pipelines')
  @ApiOperation({ summary: 'Payflow: list pipelines and stages' })
  async pipelines(@Headers('authorization') authorization?: string) {
    const integration = await this.payflowService.authenticate(authorization);
    return { pipelines: await this.payflowService.listPipelines(integration.workspaceId) };
  }

  @Public()
  @Post('sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Payflow: upsert a customer and record a payment' })
  async sync(@Body() dto: PayflowSyncDto, @Headers('authorization') authorization?: string) {
    const integration = await this.payflowService.authenticate(authorization);
    return this.payflowService.sync(integration, dto);
  }
}
