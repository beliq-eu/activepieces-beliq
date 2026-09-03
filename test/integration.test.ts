import { describe, expect, it } from 'vitest';
import { Beliq } from '@beliq/sdk';
import { runGenerate, SAMPLE_INVOICE } from '../src/lib/actions/generate';
import { runValidate } from '../src/lib/actions/validate';
import { runParse } from '../src/lib/actions/parse';
import { runConvert } from '../src/lib/actions/convert';
import type { FilesWriter } from '../src/lib/common/io';

// Live smoke test against the real beliq API. Skipped unless BELIQ_API_KEY is
// set. It drives the SAME run handlers the actions use, so it validates the
// connector end to end against the live contract, not just in isolation. The
// flow is a self-contained round trip: generate an XRechnung, then validate,
// parse, and convert the bytes it produced (no external sample files needed).
//
// It generates with `verify: true`, so the API applies the XRechnung CIUS to
// what it produced and a 422 fails the run. That is the point: the fixture is
// the SAMPLE_INVOICE the Activepieces form offers as its default, so this run
// is what proves the shipped default is a document the API will accept.
const API_KEY = process.env['BELIQ_API_KEY'];
const BASE_URL = process.env['BELIQ_BASE_URL'];

const memoryFiles = (): FilesWriter => ({
  async write({ fileName }) {
    return `memory://${fileName}`;
  },
});

const makeClient = () => new Beliq({ apiKey: API_KEY as string, baseUrl: BASE_URL });

// The preflight job checks the budget before this suite starts, but another repo
// sharing the key can take the last documents in between. A spent quota means the
// contract could not be checked, not that it is broken, so it lands in the same
// arm as a missing key: skip, and say so loudly enough to reach the run summary.
//
// Matched on the message because these run handlers are driven the way Activepieces
// drives them, and `mapError` flattens the SDK's BeliqApiError into a plain Error
// carrying the code in parentheses (src/lib/common/client.ts).
const isQuotaExhausted = (err: unknown): boolean =>
  err instanceof Error && err.message.endsWith('(QUOTA_EXCEEDED)');

describe.skipIf(!API_KEY)('beliq live API', () => {
  it('me() returns account context without spending quota', async () => {
    const account = await makeClient().me();
    expect(account).toBeTruthy();
  });

  it('generate -> validate -> parse -> convert round trip', async (ctx) => {
    const client = makeClient();
    try {
      const generated = (await runGenerate(
        client,
        { standard: 'xrechnung', output: 'xml', invoice: SAMPLE_INVOICE, verify: true },
        memoryFiles(),
      )) as Record<string, unknown>;
      expect(generated.fileName).toBe('invoice.xml');
      const xml = generated.xml as string;
      expect(xml).toContain('<');

      const verdict = (await runValidate(client, {
        inputSource: 'text',
        documentText: xml,
        contentType: 'auto',
        format: 'auto',
      })) as Record<string, unknown>;
      expect(typeof verdict.valid).toBe('boolean');
      expect(verdict.format).toBeTruthy();

      const parsed = (await runParse(client, {
        inputSource: 'text',
        documentText: xml,
        contentType: 'auto',
        format: 'auto',
      })) as Record<string, unknown>;
      expect(parsed).toBeTruthy();

      const converted = (await runConvert(
        client,
        {
          inputSource: 'text',
          documentText: xml,
          contentType: 'auto',
          sourceFormat: 'auto',
          targetFormat: 'ubl',
        },
        memoryFiles(),
      )) as Record<string, unknown>;
      expect(converted.success).toBe(true);
      expect(converted.fileName).toBeTruthy();
    } catch (err) {
      if (!isQuotaExhausted(err)) throw err;
      console.warn(
        '::warning::beliq API monthly quota is spent, so the live contract was NOT verified by this run.',
      );
      ctx.skip();
    }
  });
});
