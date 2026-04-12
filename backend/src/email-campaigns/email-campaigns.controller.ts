import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { EmailCampaignsService } from './email-campaigns.service';

@ApiTags('Email Campaigns')
@Controller('email-campaigns')
@UseGuards(JwtAuthGuard)
export class EmailCampaignsController {
  constructor(private readonly service: EmailCampaignsService) {}

  @Get()
  @ApiOperation({ summary: 'List all email campaigns' })
  findAll(@Req() req: any) {
    return this.service.findAll(req.user.workspaceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get email campaign by ID' })
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.service.findOne(req.user.workspaceId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Create email campaign draft' })
  create(@Req() req: any, @Body() body: any) {
    return this.service.create(req.user.workspaceId, req.user.id, body);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update email campaign' })
  update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.service.update(req.user.workspaceId, id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete email campaign' })
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(req.user.workspaceId, id);
  }

  @Post(':id/send')
  @ApiOperation({ summary: 'Send email campaign now (async — returns immediately)' })
  send(@Req() req: any, @Param('id') id: string) {
    return this.service.sendAsync(req.user.workspaceId, id);
  }

  @Post(':id/schedule')
  @ApiOperation({ summary: 'Schedule email campaign for a future time' })
  schedule(@Req() req: any, @Param('id') id: string, @Body() body: { scheduledAt: string }) {
    if (!body.scheduledAt) throw new BadRequestException('scheduledAt is required');
    return this.service.scheduleAt(req.user.workspaceId, id, new Date(body.scheduledAt));
  }

  @Post('preview-audience')
  @ApiOperation({ summary: 'Preview audience count for given filters' })
  previewAudience(@Req() req: any, @Body() body: { filters: any }) {
    return this.service.previewAudience(req.user.workspaceId, body.filters);
  }
}
