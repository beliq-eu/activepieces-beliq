import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Beliq } from '@beliq/sdk';
import { runValidate } from '../src/lib/actions/validate';
import { beliqAuth } from '../src/lib/common/auth';
import { CONNECTION_CHECK_FIT, STEP_FIT } from '../src/lib/common/client';

// The real validate action and a real SDK client against a real HTTP server on
// 127.0.0.1. For the action, the server's `Retry-After: 30`, Activepieces'
// 600-second limit and the fit are all scaled by SCALE; the SDK's own backoff
// waits are not. The connection check runs unscaled through its own client,
// with global fetch only rewriting the fixed https://api.beliq.eu origin.
const SCALE = 1 / 30;
const RETRY_AFTER_S = 30 * SCALE;
const HOST_LIMIT_MS = 600_000 * SCALE;
const CONNECTION_DIALOG_MS = 30_000;
const API_ORIGIN = 'https://api.beliq.eu';
const realFetch = globalThis.fetch;

type Handler = (req: IncomingMessage, res: ServerResponse, n: number) => void;

let server: Server;
let origin: string;
let requests: number;
let handler: Handler;

beforeEach(async () => {
  requests = 0;
  server = createServer((req, res) => {
    requests++;
    handler(req, res, requests);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  if (server.listening) await close();
});

function close(): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(JSON.stringify(body));
}

function databaseUnavailable(res: ServerResponse, retryAfter: number): void {
  json(
    res,
    503,
    { success: false, error: { code: 'DATABASE_UNAVAILABLE', message: 'database unavailable' } },
    { 'Retry-After': String(retryAfter) },
  );
}

function valid(res: ServerResponse): void {
  json(res, 200, { success: true, data: { valid: true, errors: [], warnings: [] } });
}

async function validate(): Promise<{ ok: boolean; message?: string; ms: number }> {
  const client = new Beliq({
    apiKey: 'test-key',
    baseUrl: origin,
    retryBudgetMs: STEP_FIT.retryBudgetMs * SCALE,
    timeoutMs: STEP_FIT.timeoutMs * SCALE,
  });
  const started = performance.now();
  try {
    await runValidate(client, { inputSource: 'text', documentText: '<Invoice/>' });
    return { ok: true, ms: performance.now() - started };
  } catch (error) {
    return { ok: false, message: (error as Error).message, ms: performance.now() - started };
  }
}

describe('an action during an outage ends inside the 600-second run limit', () => {
  it('the fit leaves room for the last attempt', () => {
    expect(STEP_FIT.retryBudgetMs + STEP_FIT.timeoutMs).toBeLessThan(600_000);
  });

  it('rides a 503 DATABASE_UNAVAILABLE window of 5 scaled minutes, and succeeds', async () => {
    const windowEnds = performance.now() + 300_000 * SCALE;
    handler = (_req, res) => (performance.now() < windowEnds ? databaseUnavailable(res, RETRY_AFTER_S) : valid(res));
    const result = await validate();
    expect(result.ok).toBe(true);
    expect(requests).toBeGreaterThan(2);
    expect(result.ms).toBeLessThan(HOST_LIMIT_MS);
  });

  it('fails with the wait named before the limit when the outage outlasts the budget', async () => {
    handler = (_req, res) => databaseUnavailable(res, RETRY_AFTER_S);
    const result = await validate();
    expect(result.ok).toBe(false);
    expect(result.message).toBe(
      `beliq is unavailable for now: database unavailable. Try again in ${RETRY_AFTER_S} second (DATABASE_UNAVAILABLE)`,
    );
    // The SDK refuses the wait that would pass the budget, so it stops up to one
    // wait (plus its jitter) short of it.
    expect(result.ms).toBeGreaterThan(STEP_FIT.retryBudgetMs * SCALE - 2 * RETRY_AFTER_S * 1000);
    expect(result.ms).toBeLessThan(HOST_LIMIT_MS);
  });

  it('ends before the limit when every retry hangs', async () => {
    handler = (_req, res, n) => {
      if (n === 1) {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('upstream unavailable');
      }
    };
    const result = await validate();
    expect(result.ok).toBe(false);
    expect(requests).toBeGreaterThanOrEqual(2);
    expect(result.ms).toBeLessThan(HOST_LIMIT_MS);
  });

  it('says beliq could not be reached, and did not say when, when nothing listens', async () => {
    await close();
    const result = await validate();
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(
      /^beliq is unavailable for now: could not reach the beliq API \(.+\)\. beliq did not say when; try again later$/,
    );
    expect(result.ms).toBeLessThan(HOST_LIMIT_MS);
  });
});

describe('the connection check answers while the user waits on the dialog', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', (url: string | URL, init?: RequestInit) =>
      realFetch(String(url).replace(API_ORIGIN, origin), init),
    );
  });

  it('rides a blip and accepts the key', async () => {
    handler = (_req, res, n) => {
      if (n === 1) {
        res.writeHead(503, { 'Content-Type': 'text/plain' });
        res.end('upstream unavailable');
        return;
      }
      json(res, 200, { success: true, data: { livemode: false } });
    };
    const result = await beliqAuth.validate!({ auth: { apiKey: 'blq_test_x' } } as never);
    expect(result).toEqual({ valid: true });
    expect(requests).toBe(2);
  });

  it('reports an outage at once instead of waiting it out', async () => {
    handler = (_req, res) => databaseUnavailable(res, 30);
    const started = performance.now();
    const result = await beliqAuth.validate!({ auth: { apiKey: 'blq_test_x' } } as never);
    expect(result).toMatchObject({ valid: false });
    expect(requests).toBe(1);
    expect(performance.now() - started).toBeLessThan(CONNECTION_DIALOG_MS);
  });

  it('ends a hung check within its fit', async () => {
    handler = () => {};
    const started = performance.now();
    const result = await beliqAuth.validate!({ auth: { apiKey: 'blq_test_x' } } as never);
    expect(result).toMatchObject({ valid: false });
    expect(performance.now() - started).toBeLessThan(
      CONNECTION_CHECK_FIT.retryBudgetMs + CONNECTION_CHECK_FIT.timeoutMs + 1_000,
    );
  }, 40_000);
});
