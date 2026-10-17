/**
 * What the Leads list asks the server for.
 *
 * The board this replaced scoped every request to one pipeline, which is why
 * a closer only ever saw a slice of the leads — and with duplicate default
 * pipelines in this workspace, an arbitrary slice. Nothing here sends a
 * pipeline: the list is every lead in the workspace, narrowed by date and
 * source only.
 */

export interface LeadFilterState {
  search?: string;
  /** '' or 'all' means every source. */
  source?: string;
  /** 0-indexed, as JavaScript gives it. null means no date filter. */
  month?: number | null;
  year?: number;
  page?: number;
  limit?: number;
}

export interface ContactQuery {
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: string;
  search?: string;
  source?: string;
  excludeSource?: string;
  createdFrom?: string;
  createdTo?: string;
}

const DEFAULT_LIMIT = 50;

/** The sources these leads actually arrive from, in the order a caller scans. */
export const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Toate sursele' },
  { value: 'typeform', label: 'Typeform' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'manychat', label: 'ManyChat' },
  { value: 'google-ads', label: 'Google Ads' },
  { value: 'woocommerce', label: 'WooCommerce' },
  { value: 'kajabi', label: 'Kajabi' },
  { value: 'landing_page', label: 'Landing page' },
  { value: 'website', label: 'Site' },
  { value: 'referral', label: 'Recomandare' },
  { value: 'social_media', label: 'Social media' },
  { value: 'email_campaign', label: 'Campanie email' },
  { value: 'cold_outreach', label: 'Prospectare la rece' },
  { value: 'event', label: 'Eveniment' },
  { value: 'slack', label: 'Slack' },
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'manual', label: 'Adăugat manual' },
  { value: 'other', label: 'Altă sursă' },
];

/**
 * The first and last instant of a month. Day 0 of the next month is the last
 * day of this one, which is how February and the 30-day months stay right
 * without a table of lengths.
 */
export function monthRange(year: number, month: number): { createdFrom: string; createdTo: string } {
  const from = new Date(year, month, 1, 0, 0, 0, 0);
  const to = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { createdFrom: from.toISOString(), createdTo: to.toISOString() };
}

export function buildContactQuery(state: LeadFilterState): ContactQuery {
  const query: ContactQuery = {
    page: state.page ?? 1,
    limit: state.limit ?? DEFAULT_LIMIT,
    // A lead that just arrived is the one a caller wants first.
    sortBy: 'createdAt',
    sortOrder: 'DESC',
    // Payflow only creates a contact when someone pays; that's a customer,
    // not a lead someone should call.
    excludeSource: 'payflow',
  };

  const search = state.search?.trim();
  if (search) query.search = search;

  if (state.source && state.source !== 'all') query.source = state.source;

  if (state.month !== null && state.month !== undefined) {
    const { createdFrom, createdTo } = monthRange(state.year ?? new Date().getFullYear(), state.month);
    query.createdFrom = createdFrom;
    query.createdTo = createdTo;
  }

  return query;
}
