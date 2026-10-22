import { ContactSource } from '../../database/entities/contact.entity';
import { DEFAULT_SHEET_LEAD_SOURCE, parseLeadSource, reachesCallQueue } from './sheet-lead-source';

describe('sheet lead source', () => {
  it('reads the spellings a sheet actually holds', () => {
    expect(parseLeadSource('Manual')).toBe(ContactSource.MANUAL);
    expect(parseLeadSource(' WooCommerce ')).toBe(ContactSource.WOOCOMMERCE);
    expect(parseLeadSource('woo')).toBe(ContactSource.WOOCOMMERCE);
    expect(parseLeadSource('Formular')).toBe(ContactSource.TYPEFORM);
    expect(parseLeadSource('Comandă')).toBe(ContactSource.WOOCOMMERCE);
  });

  it('says nothing for an empty or unknown cell', () => {
    expect(parseLeadSource('')).toBeUndefined();
    expect(parseLeadSource('   ')).toBeUndefined();
    expect(parseLeadSource(null)).toBeUndefined();
    expect(parseLeadSource('facebook ads')).toBeUndefined();
  });

  it('knows which sources the callers see', () => {
    expect(reachesCallQueue(ContactSource.MANUAL)).toBe(true);
    expect(reachesCallQueue(ContactSource.TYPEFORM)).toBe(true);
    expect(reachesCallQueue(ContactSource.WOOCOMMERCE)).toBe(true);
    expect(reachesCallQueue(ContactSource.OTHER)).toBe(false);
    expect(reachesCallQueue(undefined)).toBe(false);
  });

  it('puts a sheet row in front of a caller unless told otherwise', () => {
    // A row nobody classified still has to be rung; `other` is the opt-out,
    // and it is the only one of the four that the callers never see.
    expect(reachesCallQueue(DEFAULT_SHEET_LEAD_SOURCE)).toBe(true);
    expect(parseLeadSource('other')).not.toBe(DEFAULT_SHEET_LEAD_SOURCE);
  });
});
