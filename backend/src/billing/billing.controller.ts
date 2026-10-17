import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserRole } from '../database/entities/user.entity';
import { BillingService } from './billing.service';
import { BILLING_CURRENCY, PLANS, TRIAL_DAYS, isPlanId } from './plans';

const canManageBilling = (role: string) => role === UserRole.ADMIN || role === 'super_admin';

@ApiTags('Billing')
@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'Plans, current subscription and limits for this workspace' })
  async overview(@Req() req: any) {
    const access = await this.billingService.getAccess(req.user.workspaceId);
    return {
      access,
      canManage: canManageBilling(req.user.role),
      currency: BILLING_CURRENCY,
      trialDays: TRIAL_DAYS,
      plans: Object.values(PLANS),
    };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('checkout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start Stripe Checkout for a plan' })
  checkout(@Req() req: any, @Body() body: { plan?: string; interval?: string }) {
    if (!canManageBilling(req.user.role)) throw new ForbiddenException('Only workspace admins can manage billing');
    if (!isPlanId(body?.plan)) throw new BadRequestException('Unknown plan');
    const interval = body?.interval === 'year' ? 'year' : 'month';
    return this.billingService.createCheckout(req.user.workspaceId, req.user, body.plan, interval);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('portal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Open the Stripe customer portal (change plan, card, invoices, cancel)' })
  portal(@Req() req: any) {
    if (!canManageBilling(req.user.role)) throw new ForbiddenException('Only workspace admins can manage billing');
    return this.billingService.createPortal(req.user.workspaceId);
  }

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stripe webhook' })
  async webhook(@Req() req: any, @Headers('stripe-signature') signature?: string) {
    await this.billingService.handleWebhook(req.rawBody, signature);
    return { received: true };
  }
}
