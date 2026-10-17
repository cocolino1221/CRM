import { BadRequestException } from '@nestjs/common';

/**
 * Hostnames a workspace may claim for its landing pages.
 *
 * Two failures matter here and neither is cosmetic. Storing an unnormalized
 * host means the unique index lets two workspaces claim the same domain in
 * different letter case, and the Host header on a real request then matches
 * neither. And letting a tenant claim a platform hostname would point the
 * CRM's own traffic — the login page included — at that tenant's landing page.
 */

/**
 * The platform's own hosts. A tenant may never claim these or anything under
 * them.
 */
export const RESERVED_HOSTNAMES = [
  'etcrm.primafisoft.com',
  'primafisoft.com',
  'slackcrm-backend.fly.dev',
  'easyteamcrm.netlify.app',
];

const LABEL = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?';
const HOSTNAME = new RegExp(`^${LABEL}(?:\\.${LABEL})+$`);

/** Looks like four numbers separated by dots, or contains a colon (IPv6). */
function looksLikeIpAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}

/**
 * The storable form of whatever the user typed, or null if it is not a
 * hostname. People paste what is in the address bar, so a protocol, a path, a
 * port and a trailing dot all have to come off before anything is compared.
 */
export function normalizeHostname(input: unknown): string | null {
  if (typeof input !== 'string') return null;

  let host = input.trim().toLowerCase();
  if (!host) return null;

  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  host = host.split('/')[0].split('?')[0].split('#')[0];
  // A port, but not an IPv6 address — those are rejected below anyway.
  host = host.replace(/:\d+$/, '');
  host = host.replace(/\.$/, '');

  if (!host || !HOSTNAME.test(host)) return null;
  return host;
}

function isReserved(host: string): boolean {
  return RESERVED_HOSTNAMES.some(
    (reserved) => host === reserved || host.endsWith(`.${reserved}`),
  );
}

/**
 * @returns the normalized hostname, having checked it may be claimed.
 * @throws BadRequestException with a message the person can act on.
 */
export function assertHostnameAllowed(input: unknown): string {
  const raw = typeof input === 'string' ? input.trim().toLowerCase() : '';

  // Checked before normalizing: "localhost" has no dot, so the hostname
  // pattern would reject it with a less useful message.
  if (raw === 'localhost' || looksLikeIpAddress(raw.replace(/^[a-z]+:\/\//, '').split('/')[0])) {
    throw new BadRequestException('Adresa trebuie să fie un domeniu, nu o adresă IP sau localhost');
  }

  const host = normalizeHostname(input);
  if (!host) {
    throw new BadRequestException('Domeniu invalid. Exemplu: pagini.salax.ro');
  }

  if (isReserved(host)) {
    throw new BadRequestException('Acest domeniu aparține platformei și nu poate fi folosit');
  }

  return host;
}
