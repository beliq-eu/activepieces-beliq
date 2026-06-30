import { Beliq, BeliqApiError } from '@beliq/sdk';

export interface BeliqAuthValue {
  apiKey: string;
  baseUrl: string;
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
    baseUrl: String(props['baseUrl'] ?? ''),
  };
}

/** Build a configured SDK client from a resolved connection value. */
export function createClient(auth: unknown): Beliq {
  const { apiKey, baseUrl } = resolveAuth(auth);
  return new Beliq({ apiKey, baseUrl: baseUrl || undefined });
}

/**
 * Turn an SDK error into a flat Error with a readable message. A BeliqApiError
 * carries the typed `{ code, message }` from beliq's error envelope; anything
 * else is surfaced verbatim.
 */
export function mapError(error: unknown): Error {
  if (error instanceof BeliqApiError) {
    return new Error(error.code ? `${error.message} (${error.code})` : error.message);
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
