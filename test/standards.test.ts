import { describe, expect, it } from 'vitest';
import { Beliq } from '@beliq/sdk';
import { runGenerate, SAMPLE_INVOICE } from '../src/lib/actions/generate';
import { STANDARD_OPTIONS } from '../src/lib/common/options';
import type { FilesWriter } from '../src/lib/common/io';

// Generates every value the Generate action's Standard dropdown offers, from the
// invoice the form fills in by default, with "Validate Result" on as the form
// has it. The per-merge smoke in integration.test.ts proves XRechnung only, and
// a sample valid on one standard proves nothing about another. Spends one
// document per standard, so it runs weekly (.github/workflows/standards.yml),
// not on every merge.
const API_KEY = process.env['BELIQ_API_KEY'];
const BASE_URL = process.env['BELIQ_BASE_URL'];

// Factur-X and ZUGFeRD are the hybrid PDFs, which is what a user picks them for;
// the others have no hybrid form and are generated as the XML they are.
const HYBRID_PDF = new Set(['facturx', 'zugferd']);

// The default invoice is German, and each national standard needs parties and
// fields of its own country (KSeF FA(3) refuses any currency but PLN), so this
// suite cannot verify them from it. They stay out of the generate loop until
// each has a fixture of its own; the target list below still names them, so a
// change to the dropdown fails here first.
const NEEDS_OWN_FIXTURE = new Set(['fatturapa', 'facturae', 'eslog', 'ksef']);

const memoryFiles = (): FilesWriter => ({
  async write({ fileName }) {
    return `memory://${fileName}`;
  },
});

// Same arm as integration.test.ts: mapError flattens the SDK error into a plain
// Error ending in the code, and a spent allowance means "could not check".
const isQuotaExhausted = (err: unknown): boolean =>
  err instanceof Error && err.message.endsWith('(QUOTA_EXCEEDED)');

describe.skipIf(!API_KEY)('every Standard in the Generate dropdown', () => {
  it('offers the nine targets this suite was written for', () => {
    expect(STANDARD_OPTIONS.map((o) => o.value).sort()).toEqual([
      'eslog',
      'facturae',
      'facturx',
      'fatturapa',
      'ksef',
      'nlcius',
      'peppol-bis',
      'xrechnung',
      'zugferd',
    ]);
  });

  it.for(STANDARD_OPTIONS.map((o) => String(o.value)).filter((s) => !NEEDS_OWN_FIXTURE.has(s)))(
    'generates %s from the default invoice and passes verification',
    async (standard, ctx) => {
      const output = HYBRID_PDF.has(standard) ? 'pdf' : 'xml';
      const client = new Beliq({ apiKey: API_KEY as string, baseUrl: BASE_URL });
      try {
        const generated = (await runGenerate(
          client,
          { standard, output, invoice: SAMPLE_INVOICE, verify: true },
          memoryFiles(),
        )) as Record<string, unknown>;
        expect(generated.fileName).toBe(`invoice.${output}`);
        if (output === 'xml') expect(String(generated.xml).trimStart().startsWith('<')).toBe(true);
      } catch (err) {
        if (!isQuotaExhausted(err)) throw err;
        console.warn(
          `::warning::beliq API allowance is spent, so ${standard} was NOT verified by this run.`,
        );
        ctx.skip();
      }
    },
  );
});
