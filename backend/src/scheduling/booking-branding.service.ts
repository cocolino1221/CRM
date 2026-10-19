import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Workspace } from '../database/entities/workspace.entity';
import { BookingBranding, normalizeBookingBranding } from './booking-branding';

@Injectable()
export class BookingBrandingService {
  constructor(
    @InjectRepository(Workspace)
    private readonly workspaceRepository: Repository<Workspace>,
  ) {}

  /**
   * The page's look. Without a logo of its own it borrows the workspace logo
   * the mobile app already shows, so a workspace that set one gets it for free.
   */
  async get(workspaceId: string): Promise<BookingBranding> {
    const workspace = await this.workspaceRepository.findOne({ where: { id: workspaceId } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    const stored = (workspace.settings as any)?.bookingPage ?? {};
    const fallbackLogo = workspace.settings?.brandLogoUrl;
    return { ...stored, logoUrl: stored.logoUrl || fallbackLogo || undefined };
  }

  /**
   * Writes only settings.bookingPage. Rewriting the whole settings object
   * would undo anything another request changed in it meanwhile.
   */
  async set(workspaceId: string, input: unknown): Promise<BookingBranding> {
    const branding = normalizeBookingBranding(input);
    const result = await this.workspaceRepository.query(
      `UPDATE "workspaces"
          SET "settings" = jsonb_set(COALESCE("settings", '{}'::jsonb), '{bookingPage}', $1::jsonb, true)
        WHERE "id" = $2`,
      [JSON.stringify(branding), workspaceId],
    );
    // pg returns [rows, affected] for UPDATE through TypeORM's query().
    const affected = Array.isArray(result) ? result[1] : undefined;
    if (affected === 0) throw new NotFoundException('Workspace not found');
    return this.get(workspaceId);
  }
}
