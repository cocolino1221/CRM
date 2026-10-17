import { buildLeadNotification } from './lead-notification.util';

describe('buildLeadNotification', () => {
  const woo = {
    firstName: 'UDRESCU',
    lastName: 'RODICA',
    source: 'woocommerce',
    customFields: { wooOrder: { orderNumber: '881', lineItems: [{ name: 'Program 12 săpt.', quantity: 1 }, { name: 'Shaker', quantity: 2 }] } },
  };

  it('names the WooCommerce products for a new lead', () => {
    expect(buildLeadNotification(woo)).toEqual({
      title: 'New lead from WooCommerce',
      message: 'UDRESCU RODICA — ordered Program 12 săpt., 2× Shaker (order #881)',
    });
  });

  it('labels a repeat WooCommerce customer as a new order', () => {
    expect(buildLeadNotification(woo, { returning: true }).title).toBe('New WooCommerce order');
  });

  it('names the Typeform form', () => {
    expect(buildLeadNotification({
      firstName: 'Ana', lastName: 'Pop', source: 'typeform',
      customFields: { typeformMetadata: { formTitle: 'Calificare program Team Ră2' } },
    })).toEqual({
      title: 'New lead from Typeform',
      message: 'Ana Pop — added from Typeform "Calificare program Team Ră2"',
    });
  });

  it('keeps the generic wording for other sources and drops "-" placeholder last names', () => {
    expect(buildLeadNotification({ firstName: 'Ion', lastName: '-', source: 'facebook' })).toEqual({
      title: 'New lead',
      message: 'Ion was added via facebook',
    });
  });

  it('truncates very long product lists', () => {
    const many = { ...woo, customFields: { wooOrder: { lineItems: Array.from({ length: 40 }, (_, i) => ({ name: `Product number ${i}` })) } } };
    expect(buildLeadNotification(many).message.length).toBeLessThanOrEqual(240);
  });
});
