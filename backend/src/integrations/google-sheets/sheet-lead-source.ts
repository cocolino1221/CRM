import { ContactSource } from '../../database/entities/contact.entity';

/**
 * Which source a row imported from a spreadsheet is filed under.
 *
 * It decides more than a label: the "De sunat" queue only lists contacts whose
 * source is one of QUEUE_SOURCES (typeform, woocommerce, manual). Every sheet
 * row used to be saved as `other`, so leads pulled in from a sheet never
 * reached the callers — no pipeline stage could put them there, because that
 * queue does not look at stages at all.
 */
/**
 * What a sheet row is filed as when nothing says otherwise.
 *
 * `manual` rather than `other`, because a row somebody put in a spreadsheet is
 * a lead somebody has to ring — exactly like one typed into the CRM by hand,
 * and with the same zero waiting time. Filed as `other` they were invisible to
 * the callers, which is the one thing a sheet of leads must not be.
 */
export const DEFAULT_SHEET_LEAD_SOURCE = ContactSource.MANUAL;

export const SHEET_LEAD_SOURCES: ContactSource[] = [
  ContactSource.MANUAL,
  ContactSource.TYPEFORM,
  ContactSource.WOOCOMMERCE,
  ContactSource.OTHER,
];

/** Spellings a sheet column may hold for the sources above. */
const ALIASES: Record<string, ContactSource> = {
  manual: ContactSource.MANUAL,
  manuala: ContactSource.MANUAL,
  sheet: ContactSource.MANUAL,
  sheets: ContactSource.MANUAL,
  typeform: ContactSource.TYPEFORM,
  form: ContactSource.TYPEFORM,
  formular: ContactSource.TYPEFORM,
  woocommerce: ContactSource.WOOCOMMERCE,
  woo: ContactSource.WOOCOMMERCE,
  comanda: ContactSource.WOOCOMMERCE,
  other: ContactSource.OTHER,
  alta: ContactSource.OTHER,
};

/**
 * The source a value asks for, or `undefined` when it says nothing usable —
 * a typo in one cell must leave that row to the sheet's default rather than
 * filing it somewhere nobody is looking.
 */
export function parseLeadSource(value: unknown): ContactSource | undefined {
  const key = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[ăâ]/g, 'a')
    .replace(/[îi]/g, 'i')
    .replace(/[șş]/g, 's')
    .replace(/[țţ]/g, 't')
    .replace(/[\s_-]+/g, '');
  if (!key) return undefined;
  return ALIASES[key];
}

/** True while this source reaches the callers' "De sunat" list. */
export function reachesCallQueue(source?: ContactSource): boolean {
  return (
    source === ContactSource.MANUAL ||
    source === ContactSource.TYPEFORM ||
    source === ContactSource.WOOCOMMERCE
  );
}
