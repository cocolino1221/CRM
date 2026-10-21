import { createHmac } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { WooCommerceService } from './woocommerce.service';

const SECRET = 'a'.repeat(64);

function build(found: any) {
  const updates: any[] = [];
  const qb: any = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn().mockResolvedValue(found),
  };
  const contactRepository = {
    createQueryBuilder: jest.fn(() => qb),
    findOne: jest.fn().mockResolvedValue(null),
    update: jest.fn(async (_w: any, v: any) => updates.push(v)),
  };
  const service = new WooCommerceService({} as any, contactRepository as any, {} as any, {} as any, {} as any, {} as any, {} as any);
  const integration: any = { id: 'int-1', workspaceId: 'ws-1', config: { thankyouSecret: SECRET } };
  return { service, integration, updates };
}

// Exactly what the plugin sends: hash_hmac('sha256', $timestamp . '.' . $body, $secret).
const sign = (ts: string, body: string, secret = SECRET) =>
  `sha256=${createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex')}`;

describe('thank-you page answer', () => {
  const body = JSON.stringify({ order_id: 4969, ref: 'r1', question: 'Care e obiectivul?', answer: 'Să slăbesc 5 kg' });

  it('accepts the plugin\'s signature', () => {
    const { service, integration } = build(null);
    const ts = String(Math.floor(Date.now() / 1000));
    expect(() => service.verifyThankYouSignature(integration, Buffer.from(body), ts, sign(ts, body))).not.toThrow();
  });

  it('refuses a wrong secret, a changed body and a stale request', () => {
    const { service, integration } = build(null);
    const ts = String(Math.floor(Date.now() / 1000));
    expect(() => service.verifyThankYouSignature(integration, Buffer.from(body), ts, sign(ts, body, 'b'.repeat(64)))).toThrow(UnauthorizedException);
    expect(() => service.verifyThankYouSignature(integration, Buffer.from(body + ' '), ts, sign(ts, body))).toThrow(UnauthorizedException);
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    expect(() => service.verifyThankYouSignature(integration, Buffer.from(body), old, sign(old, body))).toThrow(UnauthorizedException);
  });

  it('adds the answer to the buyer\'s Notes as a bullet', async () => {
    const { service, integration, updates } = build({ id: 'c1', notes: 'WooCommerce order #4969', customFields: {} });
    await expect(service.recordThankYouAnswer(integration, JSON.parse(body))).resolves.toBe('saved');
    expect(updates[0].notes).toMatch(/WooCommerce order #4969\n\nRăspuns pe pagina de mulțumire \(.+\):\n• Care e obiectivul\? — Să slăbesc 5 kg/);
  });

  it('asks for a retry while the order is not in the CRM yet, and ignores a repeat', async () => {
    await expect(build(null).service.recordThankYouAnswer(build(null).integration, JSON.parse(body))).resolves.toBe('retry');
    const { service, integration } = build({ id: 'c1', notes: '', customFields: { thankyouAnswerRefs: ['r1'] } });
    await expect(service.recordThankYouAnswer(integration, JSON.parse(body))).resolves.toBe('duplicate');
  });
});
