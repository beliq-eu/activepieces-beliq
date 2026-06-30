import { describe, expect, it } from 'vitest';
import { Beliq } from '@beliq/sdk';
import { runGenerate } from '../src/lib/actions/generate';
import { runValidate } from '../src/lib/actions/validate';
import { runParse } from '../src/lib/actions/parse';
import { runConvert } from '../src/lib/actions/convert';
import type { FilesWriter } from '../src/lib/common/io';

// Live smoke test against the real beliq API. Skipped unless BELIQ_API_KEY is
// set. It drives the SAME run handlers the actions use, so it validates the
// connector end to end against the live contract, not just in isolation. The
// flow is a self-contained round trip: generate an XRechnung, then validate,
// parse, and convert the bytes it produced (no external sample files needed).
const API_KEY = process.env['BELIQ_API_KEY'];
const BASE_URL = process.env['BELIQ_BASE_URL'];

const memoryFiles = (): FilesWriter => ({
  async write({ fileName }) {
    return `memory://${fileName}`;
  },
});

const SAMPLE_INVOICE = {
  number: 'INV-SMOKE-1',
  issueDate: '2026-01-15',
  dueDate: '2026-02-14',
  currencyCode: 'EUR',
  buyerReference: 'BUYER-REF-01',
  seller: {
    name: 'Seller GmbH',
    vatId: 'DE123456789',
    address: { street: 'Hauptstrasse 1', city: 'Berlin', postalCode: '10115', countryCode: 'DE' },
  },
  buyer: {
    name: 'Buyer SARL',
    vatId: 'FR12345678901',
    address: { street: 'Rue de la Paix 2', city: 'Paris', postalCode: '75002', countryCode: 'FR' },
  },
  lines: [
    {
      description: 'Consulting services',
      quantity: 10,
      unitCode: 'HUR',
      unitPrice: 100,
      lineTotal: 1000,
      vatRate: 19,
      vatCategoryCode: 'S',
    },
  ],
  taxSummary: [{ vatCategoryCode: 'S', vatRate: 19, taxableAmount: 1000, taxAmount: 190 }],
  paymentMeans: { typeCode: '58', iban: 'DE89370400440532013000' },
  totalNetAmount: 1000,
  totalTaxAmount: 190,
  totalGrossAmount: 1190,
};

const makeClient = () => new Beliq({ apiKey: API_KEY as string, baseUrl: BASE_URL });

describe.skipIf(!API_KEY)('beliq live API', () => {
  it('me() returns account context without spending quota', async () => {
    const account = await makeClient().me();
    expect(account).toBeTruthy();
  });

  it('generate -> validate -> parse -> convert round trip', async () => {
    const client = makeClient();
    const generated = (await runGenerate(
      client,
      { standard: 'xrechnung', output: 'xml', invoice: SAMPLE_INVOICE, verify: false },
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
  });
});
