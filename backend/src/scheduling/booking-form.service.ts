import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace } from '../database/entities/workspace.entity';
import { Contact } from '../database/entities/contact.entity';
import {
  BookingForm,
  BookingVariant,
  formForVariant,
  normalizeBookingForm,
  normalizeBookingVariants,
} from './booking-form';
import { readBookingLinkToken } from './booking-link-token';

/** Who the order was for, as much as the booking form needs. */
export interface BookingPrefill {
  name: string;
  email: string;
  phone: string;
}

@Injectable()
export class BookingFormService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
    @InjectRepository(Contact)
    private readonly contactRepository: Repository<Contact>,
  ) {}

  async get(workspaceId: string): Promise<BookingForm> {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return normalizeBookingForm((workspace.settings as any)?.bookingForm);
  }

  async getVariants(workspaceId: string): Promise<BookingVariant[]> {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    return normalizeBookingVariants((workspace.settings as any)?.bookingVariants);
  }

  /** The form a booking link asks for — its variant's (`?v=`), or the main one. */
  async getForLink(workspaceId: string, variantId?: string | null): Promise<BookingForm> {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const settings: any = workspace.settings ?? {};
    return formForVariant(
      normalizeBookingForm(settings.bookingForm),
      normalizeBookingVariants(settings.bookingVariants),
      variantId,
    );
  }

  /** Replaces the list of variants; settings.bookingVariants only. */
  async setVariants(workspaceId: string, input: unknown): Promise<BookingVariant[]> {
    const variants = normalizeBookingVariants(input);
    const result = await this.workspaceRepository.query(
      `UPDATE "workspaces"
          SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), '{bookingVariants}', $1::jsonb, true)
        WHERE "id" = $2`,
      [JSON.stringify(variants), workspaceId],
    );
    const affected = Array.isArray(result) ? result[1] : undefined;
    if (affected === 0) throw new NotFoundException('Workspace not found');
    return variants;
  }

  /** Writes only settings.bookingForm, like the page look does for bookingPage. */
  async set(workspaceId: string, input: unknown): Promise<BookingForm> {
    const form = normalizeBookingForm(input);
    const result = await this.workspaceRepository.query(
      `UPDATE "workspaces"
          SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), '{bookingForm}', $1::jsonb, true)
        WHERE "id" = $2`,
      [JSON.stringify(form), workspaceId],
    );
    const affected = Array.isArray(result) ? result[1] : undefined;
    if (affected === 0) throw new NotFoundException('Workspace not found');
    return form;
  }

  /**
   * The buyer of a WooCommerce order, for the booking page their thank-you
   * page sent them to. The link carries the order id and WooCommerce's own
   * order key — the same secret the thank-you page URL holds — rather than
   * their name and email, which would then sit in browser history and logs.
   * Only an order in this workspace answers, and only with what the form shows.
   */
  /**
   * What the visitor typed into a CRM-served form, from the encrypted pass it
   * redirected with. Read from the pass alone — never from a contact record.
   */
  prefillFromToken(workspaceId: string, token: string): BookingPrefill | null {
    const pass = readBookingLinkToken(token, process.env.JWT_SECRET || '');
    if (!pass || pass.workspaceId !== workspaceId) return null;
    return pass.prefill.name || pass.prefill.email || pass.prefill.phone ? pass.prefill : null;
  }

  private toPrefill(contact: Contact): BookingPrefill {
    const email = String(contact.email || '');
    const name = `${contact.firstName || ''} ${contact.lastName && contact.lastName !== '-' ? contact.lastName : ''}`.trim();
    return {
      name,
      // A placeholder address (no email given) is not shown; the lead types theirs.
      email: email.endsWith('.invalid') ? '' : email,
      phone: String(contact.phone || ''),
    };
  }

  async prefillFromWooOrder(workspaceId: string, orderId: string, orderKey: string): Promise<BookingPrefill | null> {
    const id = String(orderId || '').replace(/\D/g, '');
    const key = String(orderKey || '').trim();
    if (!id || !/^wc_order_[A-Za-z0-9]+$/.test(key)) return null;

    const contact = await this.contactRepository
      .createQueryBuilder('contact')
      .where('contact.workspaceId = :workspaceId', { workspaceId })
      .andWhere('contact.deletedAt IS NULL')
      .andWhere(`"contact"."customFields" @> CAST(:token AS jsonb)`, {
        token: JSON.stringify({ wooOrderTokens: [`${id}:${key}`] }),
      })
      .orderBy('contact.updatedAt', 'DESC')
      .getOne();
    return contact ? this.toPrefill(contact) : null;
  }
}
