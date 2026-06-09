import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
  Res,
  Query,
  Ip,
  Headers,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LandingPagesService } from './landing-pages.service';
import { CreateLandingPageDto } from './dto/create-landing-page.dto';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto';
import { SubmitLandingPageDto } from './dto/submit-landing-page.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { LandingPageStatus } from '../database/entities/landing-page.entity';
import { THEME_PRESETS } from './theme-presets';

const BOT_UA = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|preview/i;

@Controller('landing-pages')
export class LandingPagesController {
  constructor(private readonly landingPagesService: LandingPagesService) {}

  @Get('theme-presets')
  @UseGuards(JwtAuthGuard)
  getThemePresets() {
    return THEME_PRESETS;
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Req() req, @Body() dto: CreateLandingPageDto) {
    return this.landingPagesService.create(req.user.id, req.user.workspaceId, dto);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  findAll(@Req() req, @Query('status') status?: LandingPageStatus) {
    return this.landingPagesService.findAll(req.user.workspaceId, status);
  }

  @Get('public/:slug')
  async findBySlug(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Headers('user-agent') userAgent: string,
    @Query('track') track?: string,
  ) {
    const skipView = track === 'false';
    const cookieName = `lp_v_${slug}`;
    const alreadyViewed = Boolean((req as any).cookies?.[cookieName]);
    const isBot = BOT_UA.test(userAgent || '');
    const countUnique = !alreadyViewed && !isBot;

    if (!skipView && countUnique) {
      res.cookie(cookieName, '1', {
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax',
      });
    }

    return this.landingPagesService.getPublicView(slug, { countUnique, skipView });
  }

  @Post('public/:slug/submit')
  submit(
    @Param('slug') slug: string,
    @Body() dto: SubmitLandingPageDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('referer') referrer: string,
  ) {
    return this.landingPagesService.submitPublic(slug, dto, {
      ipAddress: ip,
      userAgent,
      referrer,
    });
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  findOne(@Req() req, @Param('id') id: string) {
    return this.landingPagesService.findOne(id, req.user.workspaceId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  update(@Req() req, @Param('id') id: string, @Body() dto: UpdateLandingPageDto) {
    return this.landingPagesService.update(id, req.user.workspaceId, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  remove(@Req() req, @Param('id') id: string) {
    return this.landingPagesService.remove(id, req.user.workspaceId);
  }

  @Post(':id/duplicate')
  @UseGuards(JwtAuthGuard)
  duplicate(@Req() req, @Param('id') id: string) {
    return this.landingPagesService.duplicate(id, req.user.workspaceId, req.user.id);
  }
}
