import { classifyWooOrder } from './woo-order-kind';

const book = { productId: '4604', name: 'Carte de rețete', quantity: 1, total: '62.16' };
const course = { productId: '900', name: 'Program 12 săptămâni', quantity: 1, total: '1200.00' };

describe('classifyWooOrder', () => {
  it('keeps every order a lead while no lead product is chosen', () => {
    expect(classifyWooOrder([course], [], '1200').kind).toBe('lead');
    expect(classifyWooOrder([course], undefined, '1200').kind).toBe('lead');
  });

  it('makes a lead of an order that is only the book', () => {
    expect(classifyWooOrder([book], ['4604'], '69')).toEqual({ kind: 'lead', paidItems: [], amount: 0 });
  });

  it('makes a sale of anything else, worth what was paid for it', () => {
    expect(classifyWooOrder([course], ['4604'], '1200')).toMatchObject({ kind: 'won', amount: 1200 });
  });

  // Book and programme together: a buyer, and the book is not part of the sale's amount.
  it('counts a mixed order as a sale of the other products only', () => {
    const r = classifyWooOrder([book, course], [4604], '1269.99');
    expect(r.kind).toBe('won');
    expect(r.amount).toBe(1200);
    expect(r.paidItems.map((i) => i.productId)).toEqual(['900']);
  });

  it('treats a variation of the book as the book', () => {
    expect(classifyWooOrder([{ ...book, productId: '4604', variationId: '4610' }], ['4604'], '69').kind).toBe('lead');
    expect(classifyWooOrder([{ ...book, productId: '1', variationId: '4610' }], ['4610'], '69').kind).toBe('lead');
  });

  // WooCommerce keeps tax apart from the line total; the sale is what was paid.
  it('counts the tax in, as the customer paid it', () => {
    const r = classifyWooOrder([{ ...course, total: '1432.43', totalTax: '157.57' }], ['4604'], '1590');
    expect(r.amount).toBe(1590);
  });

  it('falls back to the order total when the items carry none', () => {
    expect(classifyWooOrder([{ ...course, total: undefined }], ['4604'], '350.5').amount).toBe(350.5);
  });
});
