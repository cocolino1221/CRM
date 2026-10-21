import { ContactSource } from '../database/entities/contact.entity';
import { cleanTracking, sourceFromTracking } from './booking-source';

describe('booking source', () => {
  it('reads the utm the team put on the link', () => {
    expect(sourceFromTracking({ utm_source: 'instagram', utm_campaign: 'bio' })).toEqual({
      source: ContactSource.INSTAGRAM,
      label: 'Instagram · bio',
    });
    expect(sourceFromTracking({ src: 'fb' }).source).toBe(ContactSource.FACEBOOK);
    expect(sourceFromTracking({ utm_source: 'wa' }).source).toBe(ContactSource.WHATSAPP);
    expect(sourceFromTracking({ utm_source: 'tiktok' })).toEqual({ source: ContactSource.SOCIAL_MEDIA, label: 'TikTok' });
  });

  it('falls back to the page that sent them', () => {
    expect(sourceFromTracking({ referrer: 'https://l.instagram.com/?u=x' }).source).toBe(ContactSource.INSTAGRAM);
    expect(sourceFromTracking({ referrer: 'https://lm.facebook.com/l.php' }).source).toBe(ContactSource.FACEBOOK);
    expect(sourceFromTracking({ referrer: 'https://teamra2.ro/typ' })).toEqual({
      source: ContactSource.WEBSITE,
      label: 'teamra2.ro',
    });
  });

  it('tells a Google ad from a Google search', () => {
    expect(sourceFromTracking({ utm_source: 'google', utm_medium: 'cpc' }).source).toBe(ContactSource.GOOGLE_ADS);
    expect(sourceFromTracking({ referrer: 'https://www.google.com/' })).toEqual({
      source: ContactSource.WEBSITE,
      label: 'Google (căutare)',
    });
  });

  it('calls no tracking a direct link', () => {
    expect(sourceFromTracking(null)).toEqual({ source: ContactSource.WEBSITE, label: 'Link direct' });
  });

  it('keeps only known keys, as short strings, and drops placeholders', () => {
    expect(
      cleanTracking({ utm_source: ' instagram ', utm_medium: 'xxxxx', utm_campaign: '{{c}}', evil: 'x', referrer: 42 }),
    ).toEqual({ utm_source: 'instagram' });
    expect(cleanTracking({ utm_source: 'a'.repeat(500) })?.utm_source).toHaveLength(200);
    expect(cleanTracking({})).toBeNull();
    expect(cleanTracking('nope')).toBeNull();
  });
});
