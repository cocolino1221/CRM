import { describe, expect, it } from 'vitest';
import { trackingFromPage } from './booking-tracking';

const HOST = 'etcrm.primafisoft.com';

describe('trackingFromPage', () => {
  it('keeps the utm on the link', () => {
    expect(trackingFromPage('?utm_source=instagram&utm_campaign=bio&email=a%40b.ro', '', HOST)).toEqual({
      utm_source: 'instagram',
      utm_campaign: 'bio',
    });
  });

  it('keeps the page that sent them, not our own', () => {
    expect(trackingFromPage('', 'https://l.instagram.com/?u=x', HOST)).toEqual({ referrer: 'https://l.instagram.com/?u=x' });
    expect(trackingFromPage('', `https://${HOST}/book/x`, HOST)).toBeUndefined();
  });

  it('reads a short src= too', () => {
    expect(trackingFromPage('?src=fb', '', HOST)).toEqual({ src: 'fb' });
  });

  it('is undefined when there is nothing to say', () => {
    expect(trackingFromPage('?email=a%40b.ro', '', HOST)).toBeUndefined();
    expect(trackingFromPage('', 'not a url', HOST)).toBeUndefined();
  });
});
