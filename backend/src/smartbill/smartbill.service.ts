import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { Integration, IntegrationStatus } from '../database/entities/integration.entity';

const SMARTBILL_API = 'https://ws.smartbill.ro/SBORO/api';
// Official ANAF VAT-payer lookup (free, no auth). Returns company data by CUI.
const ANAF_API = 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva';

interface SmartBillCreds {
  email: string;
  token: string;
  companyVat: string;
}

export interface SmartBillClientInput {
  name: string;
  vatCode?: string; // CUI for companies; omitted for individuals
  isTaxPayer?: boolean;
  address?: string;
  city?: string;
  county?: string;
  country?: string;
  email?: string;
  phone?: string;
}

export interface SmartBillProductInput {
  name: string;
  code?: string;
  price: number;
  quantity: number;
  measuringUnit?: string;
  currency?: string;
  isTaxIncluded?: boolean;
  taxName?: string;
  taxPercentage?: number;
  isService?: boolean;
}

export interface CreateInvoiceDto {
  seriesName: string;
  client: SmartBillClientInput;
  product: SmartBillProductInput;
  issueDate?: string;
  dueDate?: string;
  currency?: string;
  language?: string;
}

@Injectable()
export class SmartBillService {
  private readonly logger = new Logger(SmartBillService.name);

  constructor(
    @InjectRepository(Integration)
    private readonly integrationRepository: Repository<Integration>,
    private readonly httpService: HttpService,
  ) {}

  // ─── Credentials ──────────────────────────────────────────────────────────

  private async getCreds(workspaceId: string): Promise<SmartBillCreds> {
    const integration = await this.integrationRepository
      .createQueryBuilder('integration')
      .where('integration.workspaceId = :workspaceId', { workspaceId })
      .andWhere('integration.status != :disabled', { disabled: IntegrationStatus.DISABLED })
      .andWhere(
        "(integration.externalId = :sb OR integration.config ->> 'provider' = :sb)",
        { sb: 'smartbill' },
      )
      .orderBy('integration.updatedAt', 'DESC')
      .getOne();

    if (!integration) {
      throw new NotFoundException('SmartBill nu este conectat. Mergi în Integrations și conectează SmartBill.');
    }

    const token = String((integration.credentials as any)?.apiToken || '').trim();
    const email = String((integration.config as any)?.email || '').trim();
    const companyVat = String((integration.config as any)?.companyVat || '').trim();

    if (!token || !email || !companyVat) {
      throw new BadRequestException('Configurarea SmartBill este incompletă (lipsește token, email sau Company VAT).');
    }

    return { email, token, companyVat };
  }

  private authHeader(creds: SmartBillCreds): string {
    return 'Basic ' + Buffer.from(`${creds.email}:${creds.token}`).toString('base64');
  }

  private smartbillError(error: any, fallback: string): string {
    const data = error?.response?.data;
    return String(
      data?.errorText || data?.message || error?.message || fallback,
    ).trim();
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  async getStatus(workspaceId: string): Promise<{ connected: boolean; companyVat?: string }> {
    try {
      const creds = await this.getCreds(workspaceId);
      return { connected: true, companyVat: creds.companyVat };
    } catch {
      return { connected: false };
    }
  }

  // ─── Invoice series (live from SmartBill) ───────────────────────────────────

  async getSeries(workspaceId: string): Promise<Array<{ name: string; nextNumber?: number }>> {
    const creds = await this.getCreds(workspaceId);
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${SMARTBILL_API}/series`, {
          params: { cif: creds.companyVat, type: 'f' },
          headers: { Authorization: this.authHeader(creds), Accept: 'application/json' },
        }),
      );
      const list = Array.isArray(response.data?.list) ? response.data.list : [];
      return list.map((s: any) => ({
        name: String(s?.name || '').trim(),
        nextNumber: typeof s?.nextNumber === 'number' ? s.nextNumber : undefined,
      })).filter((s: any) => s.name);
    } catch (error: any) {
      throw new BadRequestException(this.smartbillError(error, 'Nu am putut citi seriile de facturare din SmartBill.'));
    }
  }

  // ─── Company lookup via ANAF (prefill for company clients) ───────────────────

  async lookupCompany(cui: string): Promise<SmartBillClientInput> {
    const digits = String(cui || '').replace(/[^0-9]/g, '');
    if (!digits) {
      throw new BadRequestException('CUI invalid.');
    }
    const today = new Date().toISOString().slice(0, 10);
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          ANAF_API,
          [{ cui: Number(digits), data: today }],
          { headers: { 'Content-Type': 'application/json' } },
        ),
      );
      const found = response.data?.found?.[0];
      if (!found) {
        throw new NotFoundException('Compania nu a fost găsită în ANAF pentru acest CUI.');
      }
      const general = found.date_generale || {};
      const seat = found.adresa_sediu_social || {};
      const isVatPayer = !!found.inregistrare_scop_Tva?.scpTVA;
      const street = [seat.sdenumire_Strada, seat.snumar_Strada]
        .map((s: any) => String(s || '').trim())
        .filter(Boolean)
        .join(' nr. ');
      return {
        name: String(general.denumire || '').trim(),
        vatCode: (isVatPayer ? 'RO' : '') + digits,
        isTaxPayer: isVatPayer,
        address: street || String(general.adresa || '').trim(),
        city: String(seat.sdenumire_Localitate || '').trim() || undefined,
        county: String(seat.sdenumire_Judet || '').trim() || undefined,
        country: 'Romania',
      };
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      throw new BadRequestException(this.smartbillError(error, 'Interogarea ANAF a eșuat.'));
    }
  }

  // ─── Product search via SmartBill stocks (live) ──────────────────────────────

  async searchProducts(
    workspaceId: string,
    query?: string,
  ): Promise<Array<{ name: string; code?: string; measuringUnit?: string; quantity?: number }>> {
    const creds = await this.getCreds(workspaceId);
    const today = new Date().toISOString().slice(0, 10);
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${SMARTBILL_API}/stocks`, {
          params: {
            cif: creds.companyVat,
            date: today,
            ...(query ? { productName: query } : {}),
          },
          headers: { Authorization: this.authHeader(creds), Accept: 'application/json' },
        }),
      );
      const root = response.data?.stocks ?? response.data;
      const warehouses = Array.isArray(root?.list) ? root.list : [];
      const products: Array<{ name: string; code?: string; measuringUnit?: string; quantity?: number }> = [];
      const seen = new Set<string>();
      for (const wh of warehouses) {
        const items = Array.isArray(wh?.products) ? wh.products : [];
        for (const p of items) {
          const name = String(p?.productName || '').trim();
          if (!name) continue;
          const key = name.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          products.push({
            name,
            code: String(p?.productCode || '').trim() || undefined,
            measuringUnit: String(p?.measuringUnit || '').trim() || undefined,
            quantity: typeof p?.quantity === 'number' ? p.quantity : undefined,
          });
        }
      }
      return products;
    } catch (error: any) {
      // Stock tracking may be disabled for the company — return empty so the UI
      // falls back to manual product entry instead of erroring.
      this.logger.warn(`SmartBill /stocks lookup failed: ${this.smartbillError(error, 'unknown')}`);
      return [];
    }
  }

  // ─── Create invoice ───────────────────────────────────────────────────────

  async createInvoice(
    workspaceId: string,
    dto: CreateInvoiceDto,
  ): Promise<{ series: string; number: string }> {
    const creds = await this.getCreds(workspaceId);

    if (!dto.seriesName?.trim()) throw new BadRequestException('Seria de facturare este obligatorie.');
    if (!dto.client?.name?.trim()) throw new BadRequestException('Numele clientului este obligatoriu.');
    if (!dto.product?.name?.trim()) throw new BadRequestException('Produsul este obligatoriu.');
    if (!(dto.product.price >= 0) || !(dto.product.quantity > 0)) {
      throw new BadRequestException('Preț sau cantitate invalidă.');
    }

    const currency = dto.currency || 'RON';
    const taxPercentage = typeof dto.product.taxPercentage === 'number' ? dto.product.taxPercentage : 21;

    const payload = {
      companyVatCode: creds.companyVat,
      client: {
        name: dto.client.name.trim(),
        vatCode: dto.client.vatCode?.trim() || undefined,
        isTaxPayer: dto.client.isTaxPayer ?? false,
        address: dto.client.address?.trim() || undefined,
        city: dto.client.city?.trim() || undefined,
        county: dto.client.county?.trim() || undefined,
        country: dto.client.country?.trim() || 'Romania',
        email: dto.client.email?.trim() || undefined,
        saveToDb: true,
      },
      issueDate: dto.issueDate || new Date().toISOString().slice(0, 10),
      dueDate: dto.dueDate || undefined,
      seriesName: dto.seriesName.trim(),
      isDraft: false,
      currency,
      language: dto.language || 'RO',
      precision: 2,
      useStock: false,
      products: [
        {
          name: dto.product.name.trim(),
          code: dto.product.code?.trim() || undefined,
          measuringUnitName: dto.product.measuringUnit?.trim() || 'buc',
          isDiscount: false,
          currency,
          quantity: dto.product.quantity,
          price: dto.product.price,
          isTaxIncluded: dto.product.isTaxIncluded ?? true,
          // For 0% VAT leave taxName unset so SmartBill applies its default "0% TVA Inclus".
          taxName: dto.product.taxName?.trim() || (taxPercentage > 0 ? 'Normala' : undefined),
          taxPercentage,
          saveToDb: false,
          isService: dto.product.isService ?? true,
        },
      ],
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${SMARTBILL_API}/invoice`, payload, {
          headers: {
            Authorization: this.authHeader(creds),
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }),
      );
      const data = response.data || {};
      if (data.errorText) {
        throw new BadRequestException(String(data.errorText));
      }
      const number = String(data.number || '').trim();
      const series = String(data.series || dto.seriesName).trim();
      if (!number) {
        throw new BadRequestException('SmartBill nu a returnat numărul facturii.');
      }
      this.logger.log(`SmartBill invoice created: ${series}${number} (ws=${workspaceId})`);
      return { series, number };
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(this.smartbillError(error, 'Crearea facturii în SmartBill a eșuat.'));
    }
  }

  // ─── Send invoice by email (SmartBill sends it to the client) ────────────────

  async sendInvoiceByEmail(
    workspaceId: string,
    body: { series: string; number: string; to?: string; subject?: string; bodyText?: string },
  ): Promise<{ sent: boolean }> {
    const creds = await this.getCreds(workspaceId);
    if (!body.series?.trim() || !body.number?.trim()) {
      throw new BadRequestException('Seria și numărul facturii sunt obligatorii.');
    }

    const payload = {
      companyVatCode: creds.companyVat,
      seriesName: body.series.trim(),
      number: body.number.trim(),
      type: 'factura',
      subject: body.subject?.trim() || undefined,
      to: body.to?.trim() || undefined,
      bodyText: body.bodyText?.trim() || undefined,
    };

    try {
      const response = await firstValueFrom(
        this.httpService.post(`${SMARTBILL_API}/document/send`, payload, {
          headers: {
            Authorization: this.authHeader(creds),
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
        }),
      );
      if (response.data?.errorText) {
        throw new BadRequestException(String(response.data.errorText));
      }
      return { sent: true };
    } catch (error: any) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException(this.smartbillError(error, 'Trimiterea facturii pe email a eșuat.'));
    }
  }

  // ─── Download invoice PDF ────────────────────────────────────────────────────

  async getInvoicePdf(
    workspaceId: string,
    series: string,
    number: string,
  ): Promise<Buffer> {
    const creds = await this.getCreds(workspaceId);
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${SMARTBILL_API}/invoice/pdf`, {
          params: { cif: creds.companyVat, seriesname: series, number },
          headers: { Authorization: this.authHeader(creds), Accept: 'application/octet-stream' },
          responseType: 'arraybuffer',
        }),
      );
      return Buffer.from(response.data);
    } catch (error: any) {
      throw new BadRequestException(this.smartbillError(error, 'Descărcarea PDF-ului a eșuat.'));
    }
  }
}
