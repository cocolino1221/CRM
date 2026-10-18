import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_BYTES, rejectReasonFor } from './image-upload';

const file = (over: Partial<{ type: string; size: number; name: string }> = {}) =>
  ({ type: 'image/jpeg', size: 1_000_000, name: 'poza.jpg', ...over }) as File;

describe('rejectReasonFor', () => {
  it('accepts an ordinary photo', () => {
    expect(rejectReasonFor(file())).toBeNull();
    expect(rejectReasonFor(file({ type: 'image/png', name: 'a.png' }))).toBeNull();
    expect(rejectReasonFor(file({ type: 'image/webp' }))).toBeNull();
  });

  // A phone camera photo is routinely 8-12 MB. Uploading it and waiting for
  // the server to refuse wastes the caller's data and tells them nothing.
  it('refuses a file larger than the limit, and says the size', () => {
    const reason = rejectReasonFor(file({ size: MAX_IMAGE_BYTES + 1 }));

    expect(reason).toBeTruthy();
    expect(reason).toMatch(/MB/);
  });

  it('accepts a file exactly at the limit', () => {
    expect(rejectReasonFor(file({ size: MAX_IMAGE_BYTES }))).toBeNull();
  });

  it('refuses something that is not an image', () => {
    for (const type of ['application/pdf', 'text/plain', 'video/mp4']) {
      expect(rejectReasonFor(file({ type }))).toBeTruthy();
    }
  });

  // Some Android pickers hand over a file with no type at all, so the
  // extension is the only thing left to judge it by.
  it('falls back to the extension when the picker reports no type', () => {
    expect(rejectReasonFor(file({ type: '', name: 'poza.jpg' }))).toBeNull();
    expect(rejectReasonFor(file({ type: '', name: 'contract.pdf' }))).toBeTruthy();
    expect(rejectReasonFor(file({ type: '', name: 'fara-extensie' }))).toBeTruthy();
  });

  // An unconverted iPhone photo. Refusing it told the owner their own camera
  // roll was "not an image".
  it('accepts an iPhone HEIC photo', () => {
    expect(rejectReasonFor(file({ type: 'image/heic', name: 'IMG_0001.HEIC' }))).toBeNull();
  });

  // Browsers hand over SVG as an image type, and an SVG can carry script.
  it('refuses SVG, which can carry script', () => {
    expect(rejectReasonFor(file({ type: 'image/svg+xml', name: 'a.svg' }))).toBeTruthy();
  });

  it('refuses an empty file rather than uploading nothing', () => {
    expect(rejectReasonFor(file({ size: 0 }))).toBeTruthy();
  });

  it('says something rather than throwing when handed nothing', () => {
    expect(rejectReasonFor(null as any)).toBeTruthy();
    expect(rejectReasonFor(undefined as any)).toBeTruthy();
  });

  it('answers in Romanian, like the rest of the editor', () => {
    const reason = rejectReasonFor(file({ type: 'application/pdf' }));

    expect(reason).toMatch(/imagin|fișier|poz/i);
  });
});
