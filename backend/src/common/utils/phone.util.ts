const DEFAULT_COUNTRY_CODE = process.env.CONTACT_PHONE_DEFAULT_COUNTRY_CODE || '40';

/**
 * Normalize a phone number to E.164-like format.
 * - keeps international numbers with "+" as-is (digits only)
 * - converts 00 prefix to +
 * - converts local 0-prefixed numbers to +{defaultCountryCode}...
 * - falls back to +{digits}
 */
export function normalizePhoneE164(
  value?: string | null,
  defaultCountryCode: string = DEFAULT_COUNTRY_CODE,
): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;

  if (trimmed.startsWith('+')) {
    return `+${digits}`;
  }

  if (digits.startsWith('00') && digits.length > 2) {
    return `+${digits.slice(2)}`;
  }

  if (defaultCountryCode && digits.startsWith(defaultCountryCode)) {
    return `+${digits}`;
  }

  if (defaultCountryCode && digits.startsWith('0')) {
    return `+${defaultCountryCode}${digits.slice(1)}`;
  }

  return `+${digits}`;
}

export function normalizePhoneDigits(value?: string | null): string | null {
  const normalized = normalizePhoneE164(value);
  if (!normalized) return null;
  return normalized.replace(/\D/g, '');
}
