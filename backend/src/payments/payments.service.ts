import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Deal } from '../database/entities/deal.entity';
import { DocumentsService } from '../documents/documents.service';
import {
  PaymentRow,
  PaymentSummary,
  fromPayflowDeal,
  fromPayfunnelDocument,
  mergePayments,
  summarize,
} from './payment-row';

/**
 * Every payment the CRM knows about, from both providers.
 *
 * PayFunnels payments are metadata on signed documents and are read through
 * DocumentsService rather than reimplemented — that file is 7,000 lines and
 * moving its payment handling wholesale is a separate job with its own risk.
 * Payflow transactions land as closed deals and had no screen at all until
 * now.
 */
@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Deal)
    private readonly dealRepository: Repository<Deal>,
    private readonly documentsService: DocumentsService,
  ) {}

  async findAll(
    workspaceId: string,
    query: { search?: string; status?: string; source?: string } = {},
  ): Promise<{ data: PaymentRow[]; summary: PaymentSummary }> {
    const [payfunnel, payflow] = await Promise.all([
      this.readPayfunnel(workspaceId),
      this.readPayflow(workspaceId),
    ]);

    let rows = mergePayments(payflow, payfunnel);

    if (query.source) {
      rows = rows.filter((r) => r.source === query.source);
    }
    if (query.status && query.status !== 'all') {
      rows = rows.filter((r) => r.status === query.status);
    }
    if (query.search?.trim()) {
      const needle = query.search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.title, r.contact?.name, r.contact?.email, r.reference, r.document?.name]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(needle)),
      );
    }

    // Summarised after filtering, so the totals describe what is on screen.
    return { data: rows, summary: summarize(rows) };
  }

  private async readPayfunnel(workspaceId: string): Promise<PaymentRow[]> {
    try {
      const result: any = await this.documentsService.findPayments(workspaceId, {
        page: 1,
        limit: 500,
      });
      const items: any[] = result?.data ?? result?.items ?? [];
      return items.map(fromPayfunnelDocument);
    } catch {
      // One provider being unreachable must not empty the other's rows.
      return [];
    }
  }

  private async readPayflow(workspaceId: string): Promise<PaymentRow[]> {
    const deals = await this.dealRepository
      .createQueryBuilder('deal')
      .leftJoinAndSelect('deal.contact', 'contact')
      .where('deal.workspaceId = :workspaceId', { workspaceId })
      .andWhere(`deal.customFields->>'source' = :source`, { source: 'payflow' })
      .orderBy('deal.actualCloseDate', 'DESC')
      .take(500)
      .getMany();

    return deals.map(fromPayflowDeal);
  }
}
