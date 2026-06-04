import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { Integration, IntegrationStatus } from '../database/entities/integration.entity';

const SMARTBILL_API = 'https://ws.smartbill.ro/SBORO/api';
// Official ANAF VAT-payer lookup (free, no auth). Returns company data by CUI.
const ANAF_API = 'https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva';

// Seed products always available in the invoice wizard, even before the local
// catalog has grown from emitted invoices.
const DEFAULT_PRODUCTS: Array<{ name: string; measuringUnit: string; isService: boolean }> = [
  { name: 'Servicii remodelare corporala TeamRa2', measuringUnit: 'buc', isService: true },
  { name: 'Servicii consultanta', measuringUnit: 'buc', isService: true },
  { name: 'Consultanta', measuringUnit: 'buc', isService: true },
];

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

  private async getIntegration(workspaceId: string): Promise<Integration> {
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
    return integration;
  }

  private credsFrom(integration: Integration): SmartBillCreds {
    const token = String((integration.credentials as any)?.apiToken || '').trim();
    const email = String((integration.config as any)?.email || '').trim();
    const companyVat = String((integration.config as any)?.companyVat || '').trim();

    if (!token || !email || !companyVat) {
      throw new BadRequestException('Configurarea SmartBill este incompletă (lipsește token, email sau Company VAT).');
    }
    return { email, token, companyVat };
  }

  private async getCreds(workspaceId: string): Promise<SmartBillCreds> {
    return this.credsFrom(await this.getIntegration(workspaceId));
  }

  // ─── Local product catalog (config.products[]) ──────────────────────────────
  // SmartBill has no product-nomenclature read API; /stocks only returns
  // gestiune inventory (empty for services businesses). We keep a local catalog
  // that auto-grows each time an invoice is emitted.

  private async saveProductToCatalog(
    integration: Integration,
    product: { name: string; measuringUnit?: string; isService?: boolean; taxName?: string; price?: number },
  ): Promise<void> {
    const name = product.name.trim();
    if (!name) return;
    const config: any = integration.config || {};
    const catalog: any[] = Array.isArray(config.products) ? config.products : [];
    const idx = catalog.findIndex(
      (p) => String(p?.name || '').trim().toLowerCase() === name.toLowerCase(),
    );
    const entry = {
      name,
      measuringUnit: product.measuringUnit?.trim() || 'buc',
      isService: product.isService ?? true,
      taxName: product.taxName?.trim() || undefined,
      lastPrice: typeof product.price === 'number' ? product.price : undefined,
    };
    if (idx >= 0) catalog[idx] = { ...catalog[idx], ...entry };
    else catalog.push(entry);
    integration.config = { ...config, products: catalog };
    await this.integrationRepository.save(integration);
  }

  async addProductToCatalog(
    workspaceId: string,
    product: { name: string; measuringUnit?: string; isService?: boolean; price?: number },
  ): Promise<{ saved: boolean }> {
    if (!product?.name?.trim()) throw new BadRequestException('Numele produsului este obligatoriu.');
    const integration = await this.getIntegration(workspaceId);
    await this.saveProductToCatalog(integration, product);
    return { saved: true };
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
  ): Promise<Array<{ name: string; code?: string; measuringUnit?: string; quantity?: number; price?: number; source?: string }>> {
    const integration = await this.getIntegration(workspaceId);
    const creds = this.credsFrom(integration);
    const today = new Date().toISOString().slice(0, 10);
    const term = (query || '').trim().toLowerCase();

    const products: Array<{ name: string; code?: string; measuringUnit?: string; quantity?: number; price?: number; source?: string }> = [];
    const seen = new Set<string>();
    const push = (p: { name: string; code?: string; measuringUnit?: string; quantity?: number; price?: number; source?: string }) => {
      const name = p.name.trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      if (term && !key.includes(term)) return;
      seen.add(key);
      products.push({ ...p, name });
    };

    // 1) Local catalog (auto-grown from past invoices) — always available.
    const catalog: any[] = Array.isArray((integration.config as any)?.products)
      ? (integration.config as any).products
      : [];
    for (const p of catalog) {
      push({
        name: String(p?.name || ''),
        measuringUnit: String(p?.measuringUnit || '').trim() || undefined,
        price: typeof p?.lastPrice === 'number' ? p.lastPrice : undefined,
        source: 'catalog',
      });
    }

    // 1b) Seed products — always present even if the catalog is empty.
    for (const p of DEFAULT_PRODUCTS) {
      push({ name: p.name, measuringUnit: p.measuringUnit, source: 'catalog' });
    }

    // 2) SmartBill /stocks (gestiune inventory) — empty for services businesses.
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
      for (const wh of warehouses) {
        const items = Array.isArray(wh?.products) ? wh.products : [];
        for (const p of items) {
          push({
            name: String(p?.productName || ''),
            code: String(p?.productCode || '').trim() || undefined,
            measuringUnit: String(p?.measuringUnit || '').trim() || undefined,
            quantity: Number(p?.quantity) || undefined,
            source: 'stock',
          });
        }
      }
    } catch (error: any) {
      // Stock tracking may be disabled — local catalog still serves results.
      this.logger.warn(`SmartBill /stocks lookup failed: ${this.smartbillError(error, 'unknown')}`);
    }

    return products;
  }

  // ─── Create invoice ───────────────────────────────────────────────────────

  async createInvoice(
    workspaceId: string,
    dto: CreateInvoiceDto,
  ): Promise<{ series: string; number: string }> {
    const integration = await this.getIntegration(workspaceId);
    const creds = this.credsFrom(integration);

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
      try {
        await this.saveProductToCatalog(integration, {
          name: dto.product.name,
          measuringUnit: dto.product.measuringUnit,
          isService: dto.product.isService,
          taxName: dto.product.taxName,
          price: dto.product.price,
        });
      } catch (e: any) {
        this.logger.warn(`Could not save product to local catalog: ${e?.message || e}`);
      }
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
