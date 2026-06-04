import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SmartBillService, CreateInvoiceDto } from './smartbill.service';

@ApiTags('SmartBill')
@Controller('integrations/smartbill')
@UseGuards(JwtAuthGuard)
export class SmartBillController {
  constructor(private readonly smartbill: SmartBillService) {}

  @Get('status')
  @ApiOperation({ summary: 'Check if SmartBill is connected for this workspace' })
  async status(@Req() req: any) {
    return this.smartbill.getStatus(req.user.workspaceId);
  }

  @Get('series')
  @ApiOperation({ summary: 'List invoice series from SmartBill' })
  async series(@Req() req: any) {
    return this.smartbill.getSeries(req.user.workspaceId);
  }

  @Get('company-lookup')
  @ApiOperation({ summary: 'Look up a company by CUI via ANAF (prefill client)' })
  async companyLookup(@Req() req: any, @Query('cui') cui: string) {
    if (!cui) throw new BadRequestException('Parametrul cui este obligatoriu.');
    return this.smartbill.lookupCompany(cui);
  }

  @Get('products')
  @ApiOperation({ summary: 'Search products live in SmartBill stocks' })
  async products(@Req() req: any, @Query('query') query?: string) {
    return this.smartbill.searchProducts(req.user.workspaceId, query);
  }

  @Post('products')
  @ApiOperation({ summary: 'Add a product to the local catalog' })
  async addProduct(
    @Req() req: any,
    @Body() body: { name: string; measuringUnit?: string; isService?: boolean; price?: number },
  ) {
    return this.smartbill.addProductToCatalog(req.user.workspaceId, body);
  }

  @Post('invoices')
  @ApiOperation({ summary: 'Create an invoice in SmartBill' })
  async createInvoice(@Req() req: any, @Body() body: CreateInvoiceDto) {
    return this.smartbill.createInvoice(req.user.workspaceId, body);
  }

  @Post('invoices/send')
  @ApiOperation({ summary: 'Send a created invoice by email from SmartBill' })
  async sendInvoice(
    @Req() req: any,
    @Body() body: { series: string; number: string; to?: string; subject?: string; bodyText?: string },
  ) {
    return this.smartbill.sendInvoiceByEmail(req.user.workspaceId, body);
  }

  @Get('invoices/pdf')
  @ApiOperation({ summary: 'Download an invoice PDF' })
  async pdf(
    @Req() req: any,
    @Res() res: Response,
    @Query('series') series: string,
    @Query('number') number: string,
  ) {
    if (!series || !number) throw new BadRequestException('series și number sunt obligatorii.');
    const buffer = await this.smartbill.getInvoicePdf(req.user.workspaceId, series, number);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${series}${number}.pdf"`,
    });
    res.send(buffer);
  }
}
