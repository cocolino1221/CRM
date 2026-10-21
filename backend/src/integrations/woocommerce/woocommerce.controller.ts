import { ConflictException, Controller, ForbiddenException, Get, Headers, HttpCode, HttpStatus, Logger, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WooCommerceService } from './woocommerce.service';

@ApiTags('WooCommerce')
@Controller('integrations/woocommerce')
export class WooCommerceController {
  private readonly logger = new Logger(WooCommerceController.name);

  constructor(private readonly wooCommerceService: WooCommerceService) {}

  @Public()
  @Post('webhook/:integrationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive WooCommerce order webhooks (order.created / order.updated)' })
  async webhook(
    @Param('integrationId') integrationId: string,
    @Headers('x-wc-webhook-topic') topic: string | undefined,
    @Headers('x-wc-webhook-signature') signature: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const integration = await this.wooCommerceService.getIntegration(integrationId);

    // The ping WooCommerce sends when a webhook is saved carries no topic or
    // signature (body is just "webhook_id=N") — it must get a 200 or
    // WooCommerce refuses to activate the webhook.
    if (!topic) return { received: true };

    this.wooCommerceService.verifySignature(integration, req.rawBody, signature);

    try {
      const result = await this.wooCommerceService.handleWebhook(integration, topic, req.body);
      return { received: true, ...result };
    } catch (error: any) {
      // WooCommerce auto-disables a webhook after 5 consecutive failed
      // deliveries — never let one bad order (constraint hit, odd data)
      // silently switch the whole integration off. Log and acknowledge.
      this.logger.error(`[woocommerce] failed to process ${topic} for integration ${integrationId}: ${error?.message}`, error?.stack);
      return { received: true, processed: false, reason: 'processing error' };
    }
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':integrationId/setup-webhooks')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create/repair the order webhooks in the WooCommerce store automatically' })
  async setupWebhooks(@Param('integrationId') integrationId: string, @Req() req: any) {
    const integration = await this.wooCommerceService.getIntegration(integrationId, req.user.workspaceId);
    return this.wooCommerceService.setupWebhooks(integration);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':integrationId/products')
  @ApiOperation({ summary: 'Search products in the connected WooCommerce store' })
  async products(
    @Param('integrationId') integrationId: string,
    @Query('search') search: string | undefined,
    @Req() req: any,
  ) {
    const integration = await this.wooCommerceService.getIntegration(integrationId, req.user.workspaceId);
    return { products: await this.wooCommerceService.listProducts(integration, search) };
  }

  @Public()
  @Post('thankyou/:integrationId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Receive the buyer\'s answer from the TeamRa2 Thank You plugin; adds it to the contact\'s Notes' })
  async thankYou(
    @Param('integrationId') integrationId: string,
    @Headers('x-tr2-timestamp') timestamp: string | undefined,
    @Headers('x-tr2-signature') signature: string | undefined,
    @Req() req: Request & { rawBody?: Buffer },
  ) {
    const integration = await this.wooCommerceService.getIntegration(integrationId);
    this.wooCommerceService.verifyThankYouSignature(integration, req.rawBody, timestamp, signature);
    const outcome = await this.wooCommerceService.recordThankYouAnswer(integration, req.body);
    // Not a 2xx, so the plugin retries (up to 5 times over ~30 min) once
    // the order itself has arrived.
    if (outcome === 'retry') throw new ConflictException('Order not in the CRM yet; retry later');
    return { received: true, outcome };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':integrationId/thankyou-setup')
  @ApiOperation({ summary: 'URL and secret to paste into the TeamRa2 Thank You plugin' })
  async thankYouSetup(@Param('integrationId') integrationId: string, @Req() req: any) {
    if (!['admin', 'manager', 'super_admin'].includes(String(req.user?.role))) {
      throw new ForbiddenException('Doar adminii și managerii pot vedea secretul.');
    }
    const integration = await this.wooCommerceService.getIntegration(integrationId, req.user.workspaceId);
    return this.wooCommerceService.thankYouSetup(integration);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post(':integrationId/apply-lead-products')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Apply the lead-products rule to orders already in the CRM: buyers of anything else go to Win' })
  async applyLeadProducts(@Param('integrationId') integrationId: string, @Req() req: any) {
    if (!['admin', 'manager', 'super_admin'].includes(String(req.user?.role))) {
      throw new ForbiddenException('Doar adminii și managerii pot muta clienții în Win.');
    }
    const integration = await this.wooCommerceService.getIntegration(integrationId, req.user.workspaceId);
    return this.wooCommerceService.applyLeadProductsToPastOrders(integration);
  }
}
