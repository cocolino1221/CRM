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
  NotFoundException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { LandingDomainsService } from './landing-domains.service';
import { LandingPagesService } from './landing-pages.service';
import { CreateLandingPageDto } from './dto/create-landing-page.dto';
import { UpdateLandingPageDto } from './dto/update-landing-page.dto';
import { SubmitLandingPageDto } from './dto/submit-landing-page.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { LandingPageStatus } from '../database/entities/landing-page.entity';
import { THEME_PRESETS } from './theme-presets';

const BOT_UA = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|preview/i;

@Controller('landing-pages')
export class LandingPagesController {
  constructor(
    private readonly landingPagesService: LandingPagesService,
    private readonly landingDomains: LandingDomainsService,
  ) {}

  /**
   * The hostname this request actually arrived on.
   *
   * It used to be read from a `host` query parameter the client supplied.
   * That let anyone aim a submission at another tenant's domain: the contact
   * landed in that workspace, their funnel enrolled it, and a WhatsApp
   * welcome went out on their billed number to a phone the attacker chose.
   * The client's value is ignored; only what the proxy reports counts.
   */
  private requestHost(req: Request): string | undefined {
    const headers = (req as any)?.headers ?? {};
    const forwarded = headers['x-forwarded-host'];
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return (first || headers['host'] || undefined) as string | undefined;
  }

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
    @Query('host') host?: string,
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

    void host; // Supplied by the client; deliberately not trusted.
    const workspaceId = await this.landingDomains.resolveWorkspaceByHost(this.requestHost(req));
    return this.landingPagesService.getPublicView(slug, { countUnique, skipView, workspaceId });
  }

  @Post('public/:slug/submit')
  async submit(
    @Param('slug') slug: string,
    @Body() dto: SubmitLandingPageDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
    @Headers('referer') referrer: string,
    @Req() req: Request,
    @Query('host') host?: string,
  ) {
    void host; // Supplied by the client; deliberately not trusted.
    const workspaceId = await this.landingDomains.resolveWorkspaceByHost(this.requestHost(req));
    return this.landingPagesService.submitPublic(slug, dto, {
      ipAddress: ip,
      userAgent,
      referrer,
      workspaceId,
    });
  }

  // --- Custom domains -------------------------------------------------

  /**
   * The gate a reverse proxy asks before issuing a TLS certificate for a
   * hostname it has never seen (Caddy calls this `on_demand_tls.ask`).
   *
   * Deliberately unauthenticated — the proxy has no credentials — and
   * deliberately mute: it answers yes or no and names nothing. A non-2xx
   * means "do not issue", which is what stops a stranger pointing any domain
   * at this server and burning the Let's Encrypt rate limit.
   */
  @Get('domains/check')
  // Unauthenticated by necessity — a proxy has no credentials — but it
  // answers 200 only for a hostname some workspace has verified, which makes
  // it a list of the platform's customers to anyone willing to guess domains.
  // The throttle makes guessing them one at a time expensive.
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async checkDomain(@Query('domain') domain?: string) {
    const workspaceId = domain
      ? await this.landingDomains.resolveWorkspaceByHost(domain)
      : null;
    if (!workspaceId) {
      throw new NotFoundException();
    }
    return { ok: true };
  }

  @Get('domains')
    @Roles('admin', 'manager', 'sales_rep', 'closer', 'setter', 'caller', 'support_agent')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async listDomains(@Req() req: any) {
    const domains = await this.landingDomains.list(req.user.workspaceId);
    // The DNS records travel with each row, so the screen never has to
    // reconstruct them and get a name subtly wrong.
    return domains.map((d) => ({ ...d, dns: this.landingDomains.instructionsFor(d) }));
  }

  @Post('domains')
    // Workspace-wide configuration: deleting a verified domain takes every
  // live page on it offline and releases the hostname for anyone to claim.
  @Roles('admin', 'manager')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async addDomain(@Req() req: any, @Body() body: { hostname: string }) {
    const domain = await this.landingDomains.addDomain(req.user.workspaceId, body?.hostname);
    return { ...domain, dns: this.landingDomains.instructionsFor(domain) };
  }

  @Post('domains/:id/verify')
    // Workspace-wide configuration: deleting a verified domain takes every
  // live page on it offline and releases the hostname for anyone to claim.
  @Roles('admin', 'manager')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async verifyDomain(@Req() req: any, @Param('id') id: string) {
    const domain = await this.landingDomains.verify(req.user.workspaceId, id);
    return { ...domain, dns: this.landingDomains.instructionsFor(domain) };
  }

  @Delete('domains/:id')
    // Workspace-wide configuration: deleting a verified domain takes every
  // live page on it offline and releases the hostname for anyone to claim.
  @Roles('admin', 'manager')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async removeDomain(@Req() req: any, @Param('id') id: string) {
    await this.landingDomains.remove(req.user.workspaceId, id);
    return { success: true };
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
