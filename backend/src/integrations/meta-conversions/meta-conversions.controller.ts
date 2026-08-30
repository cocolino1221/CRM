import { Body, Controller, Delete, Get, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { MetaConversionsService } from './meta-conversions.service';

@ApiTags('Meta Conversions API')
@Controller('integrations/meta-capi')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MetaConversionsController {
  constructor(private readonly metaConversionsService: MetaConversionsService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get this workspace\'s Meta Conversions API connection' })
  async getConfig(@Req() req: any) {
    return { config: await this.metaConversionsService.getConfig(req.user.workspaceId) };
  }

  @Put('config')
  @ApiOperation({ summary: 'Connect or update this workspace\'s Meta Conversions API dataset' })
  async saveConfig(
    @Req() req: any,
    @Body() dto: { datasetId: string; accessToken?: string; enabled?: boolean },
  ) {
    const config = await this.metaConversionsService.saveConfig(req.user.workspaceId, req.user.id, dto);
    return { config };
  }

  @Delete('config')
  @ApiOperation({ summary: 'Disconnect Meta Conversions API for this workspace' })
  async disconnect(@Req() req: any) {
    await this.metaConversionsService.disconnect(req.user.workspaceId);
    return { success: true };
  }

  @Post('test-event')
  @ApiOperation({ summary: 'Send a synthetic test event to verify the connection' })
  async sendTestEvent(@Req() req: any, @Body('testEventCode') testEventCode?: string) {
    return this.metaConversionsService.sendTestEvent(req.user.workspaceId, testEventCode);
  }
}
