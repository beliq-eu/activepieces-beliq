import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SAMPLE_INVOICE } from '../src/lib/actions/generate';

// The example flow is what a user imports to see the piece work, so its invoice
// has to be a document the API actually accepts. `verify` defaults to true, and
// an invoice that satisfies plain EN 16931 still fails the XRechnung CIUS on
// rules no generic example carries. This shape was proven live (2026-09-06);
// the assertions below name the rule each field answers, so a future edit that
// drops one fails here instead of in someone's first import.

const flow = JSON.parse(
  readFileSync(new URL('../examples/generate-xrechnung-scheduled.json', import.meta.url), 'utf8'),
);
const input = flow.template.trigger.nextAction.settings.input;
const invoice = input.invoice;

describe('examples/generate-xrechnung-scheduled.json', () => {
  it('generates an XRechnung with verification on', () => {
    expect(input.standard).toBe('xrechnung');
    expect(input.verify).toBe(true);
  });

  it('carries the seller contact group BG-6 (BR-DE-2)', () => {
    expect(invoice.seller.contactName).toBeTruthy();
    expect(invoice.seller.phone).toBeTruthy();
  });

  it('carries payment instructions BG-16 (BR-DE-1)', () => {
    expect(invoice.paymentMeans?.typeCode).toBeTruthy();
  });

  it('carries a VAT breakdown BG-23 matching every line (BR-CO-18, BR-S-01)', () => {
    expect(invoice.taxSummary?.length).toBeGreaterThan(0);
    for (const line of invoice.lines) {
      expect(
        invoice.taxSummary.some(
          (t: { vatCategoryCode: string; vatRate: number }) =>
            t.vatCategoryCode === line.vatCategoryCode && t.vatRate === line.vatRate,
        ),
      ).toBe(true);
    }
  });

  it('gives both parties an address xrechnung can resolve (BT-34, BT-49)', () => {
    // Resolution order is `peppol`, then `email` as EAS `EM`, then `vatId` plus
    // country. The seller resolves on its email, the buyer on its French VAT id.
    for (const party of [invoice.seller, invoice.buyer]) {
      expect(party.peppol ?? party.email ?? party.vatId).toBeTruthy();
    }
  });

  it('carries a buyerReference (BR-DE-15)', () => {
    expect(invoice.buyerReference).toBeTruthy();
  });

  it('states totals consistent with its lines (BR-CO-13, BR-CO-15)', () => {
    const net = invoice.lines.reduce((sum: number, l: { lineTotal: number }) => sum + l.lineTotal, 0);
    const tax = invoice.taxSummary.reduce((sum: number, t: { taxAmount: number }) => sum + t.taxAmount, 0);
    expect(invoice.totalNetAmount).toBe(net);
    expect(invoice.totalTaxAmount).toBe(tax);
    expect(invoice.totalGrossAmount).toBe(net + tax);
  });
});

describe('SAMPLE_INVOICE, the Generate form default', () => {
  // Published 0.2.1 shipped a default that 422'd on its own factory settings.
  // These assertions are what stops that recurring; they mirror the ones above
  // so the form default and the example flow cannot drift apart.
  it('carries every field the XRechnung CIUS requires', () => {
    expect(SAMPLE_INVOICE.seller.contactName).toBeTruthy();
    expect(SAMPLE_INVOICE.seller.phone).toBeTruthy();
    expect(SAMPLE_INVOICE.paymentMeans?.typeCode).toBeTruthy();
    expect(SAMPLE_INVOICE.taxSummary?.length).toBeGreaterThan(0);
    expect(SAMPLE_INVOICE.buyerReference).toBeTruthy();
    for (const party of [SAMPLE_INVOICE.seller, SAMPLE_INVOICE.buyer]) {
      expect(party.email ?? party.vatId).toBeTruthy();
    }
  });
});
