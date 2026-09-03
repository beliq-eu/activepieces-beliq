import { Beliq, BeliqApiError } from '@beliq/sdk';

export interface BeliqAuthValue {
  apiKey: string;
}

/**
 * Normalize the connection value into beliq credential fields. Inside an action
 * the value arrives wrapped as `{ type, props }`; inside the auth `validate`
 * hook it arrives as the bare props object, so accept either.
 */
export function resolveAuth(auth: unknown): BeliqAuthValue {
  const raw = (auth ?? {}) as Record<string, unknown>;
  const props =
    raw['props'] && typeof raw['props'] === 'object'
      ? (raw['props'] as Record<string, unknown>)
      : raw;
  return {
    apiKey: String(props['apiKey'] ?? ''),
  };
}

/** Build a configured SDK client from a resolved connection value. */
export function createClient(auth: unknown): Beliq {
  const { apiKey } = resolveAuth(auth);
  return new Beliq({ apiKey });
}

/**
 * How many rule findings a message carries before it is truncated. An Activepieces
 * step surfaces the error text and nothing else, so the findings have to fit a
 * notification; XRechnung reports its rules one layer at a time anyway, so the
 * first few are the ones worth acting on.
 */
const MAX_REPORTED_FINDINGS = 5;

/**
 * The failing rules a 422 `INVALID_INVOICE` carries in `details.validationResult`.
 * Its `message` is the fixed string "Generated invoice failed validation", so
 * without this the caller is told the document is invalid and never which rule
 * said so, in a UI that cannot show them the HTTP response.
 */
function describeFindings(details: Record<string, unknown> | undefined): string {
  const result = details?.['validationResult'];
  if (!result || typeof result !== 'object') return '';
  const errors = (result as { errors?: unknown }).errors;
  if (!Array.isArray(errors) || errors.length === 0) return '';
  const shown = errors.slice(0, MAX_REPORTED_FINDINGS).map((entry) => {
    const { ruleId, message, location } = (entry ?? {}) as {
      ruleId?: string;
      message?: string;
      location?: string;
    };
    return [ruleId, message, location ? `at ${location}` : undefined].filter(Boolean).join(' ');
  });
  const hidden = errors.length - shown.length;
  return `: ${shown.join('; ')}${hidden > 0 ? ` (+${hidden} more)` : ''}`;
}

/**
 * Turn an SDK error into a flat Error with a readable message. A BeliqApiError
 * carries the typed `{ code, message }` from beliq's error envelope plus any
 * rule findings; anything else is surfaced verbatim. The stable `(CODE)` stays
 * last so a caller can match on it.
 */
export function mapError(error: unknown): Error {
  if (error instanceof BeliqApiError) {
    const body = `${error.message}${describeFindings(error.details)}`;
    return new Error(error.code ? `${body} (${error.code})` : body);
  }
  return error instanceof Error ? error : new Error(String(error));
}

/** Coerce a Property.Json / object / JSON-string value into a non-empty plain object. */
export function asJsonObject(value: unknown): Record<string, unknown> | undefined {
  let candidate = value;
  if (typeof candidate === 'string') {
    const trimmed = candidate.trim();
    if (trimmed === '') return undefined;
    try {
      candidate = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
    const obj = candidate as Record<string, unknown>;
    return Object.keys(obj).length > 0 ? obj : undefined;
  }
  return undefined;
}
