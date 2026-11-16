import { Beliq, BeliqApiError, retryClass } from '@beliq/sdk';

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

export interface RetryFit {
  retryBudgetMs: number;
  timeoutMs: number;
}

/**
 * An Activepieces run, and each action in it, ends after 600 seconds (Cloud's
 * limit, and `AP_FLOW_TIMEOUT_SECONDS` self-hosted:
 * https://www.activepieces.com/docs/flows/known-limits). No retry starts after
 * the budget, so an action takes at most the budget plus the last attempt's
 * timeout: 540 seconds. That rides an outage of up to 7.5 minutes.
 */
export const STEP_FIT: RetryFit = { retryBudgetMs: 450_000, timeoutMs: 90_000 };

/**
 * The connection dialog waits on the key check while the user looks at it, so
 * the check rides only a blip and ends within 25 seconds.
 */
export const CONNECTION_CHECK_FIT: RetryFit = { retryBudgetMs: 5_000, timeoutMs: 20_000 };

/** Build a configured SDK client from a resolved connection value. */
export function createClient(auth: unknown, fit: RetryFit = STEP_FIT): Beliq {
  const { apiKey } = resolveAuth(auth);
  return new Beliq({ apiKey, ...fit });
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
 * When to try again: the server's `Retry-After` when it sent one in whole
 * seconds, or, for an outage the SDK stopped retrying, that it did not say.
 * Empty for any other failure.
 */
function retryHint(error: unknown, unavailable: boolean): string {
  const seconds = error instanceof BeliqApiError ? error.retryAfterSeconds : undefined;
  if (seconds !== undefined) {
    return `. Try again in ${seconds} ${seconds === 1 ? 'second' : 'seconds'}`;
  }
  return unavailable ? '. beliq did not say when; try again later' : '';
}

/**
 * Turn an SDK error into a flat Error with a readable message. A BeliqApiError
 * carries the typed `{ code, message }` from beliq's error envelope plus any
 * rule findings; an outage the SDK stopped retrying leads with that and says
 * when to try again; anything else is surfaced verbatim. The stable `(CODE)`
 * stays last so a caller can match on it.
 */
export function mapError(error: unknown): Error {
  const unavailable = retryClass(error) === 'budget';
  const lead = unavailable ? 'beliq is unavailable for now: ' : '';
  if (error instanceof BeliqApiError) {
    const body = `${lead}${error.message}${describeFindings(error.details)}${retryHint(error, unavailable)}`;
    return new Error(error.code ? `${body} (${error.code})` : body);
  }
  if (unavailable) {
    const reason = error instanceof Error ? error.message : String(error);
    return new Error(`${lead}could not reach the beliq API (${reason})${retryHint(error, true)}`, {
      cause: error,
    });
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
