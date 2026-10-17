/**
 * Checking a picked image before it is uploaded.
 *
 * The check happens in the browser because the alternative is the caller
 * watching a 12 MB phone photo crawl up a mobile connection only to be
 * refused at the far end — it costs them their data and tells them nothing
 * useful. The server still validates; this is about saying so sooner.
 */

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * SVG is excluded deliberately. Browsers report it as an image, but an SVG
 * is a document that can carry script, and these files are served back to
 * visitors on a landing page.
 */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];

/** @returns a sentence to show the person, or null when the file is fine. */
export function rejectReasonFor(file: File | null | undefined): string | null {
  if (!file) return 'Niciun fișier selectat.';

  if (!ACCEPTED.includes(file.type)) {
    return 'Acceptăm doar imagini JPG, PNG, WEBP, GIF sau AVIF.';
  }

  if (!file.size) {
    return 'Fișierul este gol.';
  }

  if (file.size > MAX_IMAGE_BYTES) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    const limit = Math.round(MAX_IMAGE_BYTES / (1024 * 1024));
    return `Imaginea are ${mb} MB, iar limita este ${limit} MB. Micșoreaz-o și încearcă din nou.`;
  }

  return null;
}
