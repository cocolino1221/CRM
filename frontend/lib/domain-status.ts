/**
 * What the domains screen says about each row.
 *
 * The state a customer sees most often is "the DNS record is not visible
 * yet", which is not a failure — it is the normal half hour after they
 * pasted a record. So nothing here says "error": it says what is happening
 * and what to do, and when the server explained a failure, it repeats the
 * server's own sentence rather than inventing a vaguer one.
 */

export interface DomainDns {
  type: string;
  name: string;
  value: string;
}

export interface DomainRow {
  id: string;
  hostname: string;
  status: string;
  verificationToken?: string;
  verifiedAt?: string | null;
  lastCheckedAt?: string | null;
  lastError?: string | null;
  isPrimary?: boolean;
  dns?: { verification: DomainDns; pointing: DomainDns };
}

export type DomainTone = 'live' | 'waiting' | 'problem';

export interface DomainDescription {
  tone: DomainTone;
  label: string;
  detail: string;
  isPrimary: boolean;
}

export function describeDomain(domain: DomainRow): DomainDescription {
  const isPrimary = Boolean(domain.isPrimary);

  if (domain.status === 'active') {
    return {
      tone: 'live',
      label: 'Activ',
      detail: 'Domeniul răspunde și certificatul se emite automat.',
      isPrimary,
    };
  }

  if (domain.status === 'failed') {
    return {
      tone: 'problem',
      label: 'Nu s-a confirmat',
      // The server's sentence names the exact record it looked for.
      detail:
        domain.lastError ||
        'Nu am putut confirma domeniul. Verifică înregistrarea TXT și încearcă din nou.',
      isPrimary,
    };
  }

  // Pending, or a status this screen has not heard of — both mean "not live
  // yet", and neither is worth an alarming colour.
  return {
    tone: 'waiting',
    label: 'În așteptare',
    detail:
      'Adaugă cele două înregistrări DNS de mai jos, apoi apasă „Verifică". Propagarea poate dura până la o oră.',
    isPrimary,
  };
}

/** Re-checking a live domain could only turn it off. */
export function nextActionFor(domain: DomainRow): 'verify' | 'none' {
  return domain.status === 'active' ? 'none' : 'verify';
}
