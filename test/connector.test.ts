import { describe, expect, it } from 'vitest';
import { Beliq, BeliqApiError } from '@beliq/sdk';
import { generateAction, runGenerate } from '../src/lib/actions/generate';
import { runValidate } from '../src/lib/actions/validate';
import { runParse } from '../src/lib/actions/parse';
import { runConvert } from '../src/lib/actions/convert';
import { asJsonObject, mapError, resolveAuth } from '../src/lib/common/client';
import { resolveDocument, type FilesWriter } from '../src/lib/common/io';
import {
  CONVERT_TARGET_OPTIONS,
  facturxProfileOptionsFor,
  STANDARD_OPTIONS,
  VALIDATE_FORMAT_OPTIONS,
} from '../src/lib/common/options';

// These tests drive a real SDK client whose only injected boundary is `fetch`
// (a recorder that returns a canned Response) plus a fake AP files writer. So
// the prop -> SDK-call mapping, the wire request, response parsing, and output
// shaping are all asserted against real SDK code, not a re-implementation.

interface RecordedCall {
  url: string;
  method?: string;
  headers: Headers;
  body: unknown;
}

function clientReturning(
  responder: () => Response,
): { client: Beliq; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push({
      url: String(url),
      method: init?.method,
      headers: new Headers(init?.headers),
      body: init?.body,
    });
    return responder();
  }) as unknown as typeof fetch;
  return { client: new Beliq({ apiKey: 'test-key', fetch: fetchImpl }), calls };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ success: status < 400, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status = 400): Response {
  return new Response(JSON.stringify({ success: false, error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function recordingFiles(): { files: FilesWriter; writes: { fileName: string; data: Buffer }[] } {
  const writes: { fileName: string; data: Buffer }[] = [];
  const files: FilesWriter = {
    async write(params) {
      writes.push(params);
      return `file://${params.fileName}`;
    },
  };
  return { files, writes };
}

function bodyText(body: unknown): string {
  if (typeof body === 'string') return body;
  if (body instanceof Uint8Array) return Buffer.from(body).toString('utf8');
  return String(body ?? '');
}

describe('runValidate', () => {
  it('sends pasted text as the raw body and returns the parsed verdict', async () => {
    const verdict = { valid: true, format: 'cii', errors: [], warnings: [] };
    const { client, calls } = clientReturning(() => jsonResponse(verdict));

    const result = await runValidate(client, {
      inputSource: 'text',
      documentText: '<Invoice/>',
      contentType: 'auto',
      format: 'auto',
      franceCtc: false,
    });

    expect(result).toEqual(verdict);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('POST');
    expect(calls[0].url).toMatch(/^https:\/\/api\.beliq\.eu\/v1\/validate\?/);
    expect(calls[0].url).toContain('format=auto');
    // Auto content type sniffs XML from the leading bytes.
    expect(calls[0].headers.get('content-type')).toBe('application/xml');
    expect(bodyText(calls[0].body)).toBe('<Invoice/>');
  });

  it('reads bytes from a File prop when Input is File', async () => {
    const { client, calls } = clientReturning(() =>
      jsonResponse({ valid: false, format: 'ubl', errors: [], warnings: [] }),
    );

    await runValidate(client, {
      inputSource: 'file',
      documentFile: { data: Buffer.from('<ubl/>') },
      contentType: 'auto',
    });

    expect(bodyText(calls[0].body)).toBe('<ubl/>');
  });

  it('honors an explicit PDF content type override', async () => {
    const { client, calls } = clientReturning(() =>
      jsonResponse({ valid: true, format: 'cii', errors: [], warnings: [] }),
    );

    await runValidate(client, {
      inputSource: 'text',
      documentText: '%PDF-1.7 ...',
      contentType: 'application/pdf',
    });

    expect(calls[0].headers.get('content-type')).toBe('application/pdf');
  });

  it('maps a beliq error envelope to a flat readable error', async () => {
    const { client } = clientReturning(() => errorResponse('VALIDATION_ERROR', 'bad document'));

    await expect(
      runValidate(client, { inputSource: 'text', documentText: '<x/>', contentType: 'auto' }),
    ).rejects.toThrow('bad document (VALIDATION_ERROR)');
  });
});

describe('runParse', () => {
  it('targets /v1/parse and returns the parsed invoice JSON', async () => {
    const parsed = { invoice: { number: 'INV-1' } };
    const { client, calls } = clientReturning(() => jsonResponse(parsed));

    const result = await runParse(client, {
      inputSource: 'text',
      documentText: '<Invoice/>',
      contentType: 'auto',
      format: 'cii',
    });

    expect(result).toEqual(parsed);
    expect(calls[0].url).toContain('/v1/parse?');
    expect(calls[0].url).toContain('format=cii');
  });
});

describe('runGenerate', () => {
  it('posts the invoice JSON, writes the XML to a file, and returns metadata', async () => {
    const { client, calls } = clientReturning(
      () =>
        new Response('<Invoice>generated</Invoice>', {
          status: 200,
          headers: { 'content-type': 'application/xml', 'x-schematron-version': '1.2.3' },
        }),
    );
    const { files, writes } = recordingFiles();

    const result = (await runGenerate(
      client,
      {
        standard: 'xrechnung',
        output: 'xml',
        invoice: { number: 'INV-1' },
        verify: true,
        advanced: {},
      },
      files,
    )) as Record<string, unknown>;

    const sentBody = JSON.parse(bodyText(calls[0].body));
    expect(calls[0].url).toBe('https://api.beliq.eu/v1/generate');
    expect(sentBody.standard).toBe('xrechnung');
    expect(sentBody.output).toBe('xml');
    expect(sentBody.invoice).toEqual({ number: 'INV-1' });
    // No Factur-X profile is sent for a non-hybrid standard.
    expect(sentBody.facturxProfile).toBeUndefined();

    expect(writes).toHaveLength(1);
    expect(writes[0].fileName).toBe('invoice.xml');
    expect(result.file).toBe('file://invoice.xml');
    expect(result.fileName).toBe('invoice.xml');
    expect(result.schematronVersion).toBe('1.2.3');
    expect(result.xml).toBe('<Invoice>generated</Invoice>');
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  it('resolves the NLCIUS target to peppol-bis + the netherlands-nlcius profile', async () => {
    const { client, calls } = clientReturning(
      () =>
        new Response('<Invoice/>', {
          status: 200,
          headers: { 'content-type': 'application/xml' },
        }),
    );
    const { files } = recordingFiles();

    await runGenerate(
      client,
      { standard: 'nlcius', output: 'pdf', invoice: { number: 'NL-1' }, verify: false },
      files,
    );

    const sentBody = JSON.parse(bodyText(calls[0].body));
    expect(sentBody.standard).toBe('peppol-bis');
    expect(sentBody.profile).toBe('netherlands-nlcius');
    // NLCIUS is a UBL profile: the preset forces XML even though pdf was passed.
    expect(sentBody.output).toBe('xml');
  });

  it('includes the Factur-X profile only for the hybrid family', async () => {
    const { client, calls } = clientReturning(
      () =>
        new Response('%PDF-1.7 hybrid', {
          status: 200,
          headers: { 'content-type': 'application/pdf', 'x-pdf-kind': 'facturx' },
        }),
    );
    const { files } = recordingFiles();

    const result = (await runGenerate(
      client,
      {
        standard: 'zugferd',
        output: 'pdf',
        facturxProfile: 'extended',
        invoice: { number: 'INV-2' },
        verify: false,
      },
      files,
    )) as Record<string, unknown>;

    const sentBody = JSON.parse(bodyText(calls[0].body));
    expect(sentBody.facturxProfile).toBe('extended');
    expect(result.fileName).toBe('invoice.pdf');
    expect(result.pdfKind).toBe('facturx');
  });

  // PDF output on an XML-only standard is a hard 400 unless the request names a
  // visual to render, and the piece exposes no other way to ask for one.
  it('asks for the default visual on PDF output', async () => {
    const { client, calls } = clientReturning(
      () =>
        new Response('%PDF-1.7 visualization', {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        }),
    );
    const { files } = recordingFiles();

    await runGenerate(
      client,
      { standard: 'xrechnung', output: 'pdf', invoice: { number: 'INV-3' }, verify: false },
      files,
    );

    const sentBody = JSON.parse(bodyText(calls[0].body));
    expect(sentBody.template).toBe('standard');
    expect(sentBody.pdfTemplateId).toBeUndefined();
  });

  it('lets a saved template replace the default visual', async () => {
    const { client, calls } = clientReturning(
      () =>
        new Response('%PDF-1.7 visualization', {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        }),
    );
    const { files } = recordingFiles();

    await runGenerate(
      client,
      {
        standard: 'xrechnung',
        output: 'pdf',
        pdfTemplateId: ' k3d-9mp ',
        invoice: { number: 'INV-4' },
        verify: false,
      },
      files,
    );

    const sentBody = JSON.parse(bodyText(calls[0].body));
    expect(sentBody.pdfTemplateId).toBe('k3d-9mp');
    expect(sentBody.template).toBeUndefined();
  });

  it('asks for no visual on XML output', async () => {
    const { client, calls } = clientReturning(
      () =>
        new Response('<Invoice/>', {
          status: 200,
          headers: { 'content-type': 'application/xml' },
        }),
    );
    const { files } = recordingFiles();

    await runGenerate(
      client,
      { standard: 'xrechnung', output: 'xml', invoice: { number: 'INV-5' }, verify: false },
      files,
    );

    const sentBody = JSON.parse(bodyText(calls[0].body));
    expect(sentBody.template).toBeUndefined();
  });

  // The preset resolves output to xml, so the visual must not be requested on
  // the back of the caller's pdf choice.
  it('asks for no visual when a preset forces XML output', async () => {
    const { client, calls } = clientReturning(
      () =>
        new Response('<Invoice/>', {
          status: 200,
          headers: { 'content-type': 'application/xml' },
        }),
    );
    const { files } = recordingFiles();

    await runGenerate(
      client,
      { standard: 'nlcius', output: 'pdf', invoice: { number: 'NL-2' }, verify: false },
      files,
    );

    const sentBody = JSON.parse(bodyText(calls[0].body));
    expect(sentBody.output).toBe('xml');
    expect(sentBody.template).toBeUndefined();
  });

  // extended-ctc-fr is Factur-X only; the engine answers it on ZUGFeRD with 422
  // PROFILE_STANDARD_MISMATCH. A flow saved before the dropdown narrowed, or
  // one whose Standard was switched afterwards, can still carry it.
  it('drops a Factur-X profile the chosen standard rejects', async () => {
    const { client, calls } = clientReturning(
      () =>
        new Response('%PDF-1.7 hybrid', {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        }),
    );
    const { files } = recordingFiles();

    await runGenerate(
      client,
      {
        standard: 'zugferd',
        output: 'pdf',
        facturxProfile: 'extended-ctc-fr',
        invoice: { number: 'INV-6' },
        verify: false,
      },
      files,
    );

    const sentBody = JSON.parse(bodyText(calls[0].body));
    expect(sentBody.facturxProfile).toBeUndefined();
  });

  it('keeps extended-ctc-fr on Factur-X', async () => {
    const { client, calls } = clientReturning(
      () =>
        new Response('%PDF-1.7 hybrid', {
          status: 200,
          headers: { 'content-type': 'application/pdf' },
        }),
    );
    const { files } = recordingFiles();

    await runGenerate(
      client,
      {
        standard: 'facturx',
        output: 'pdf',
        facturxProfile: 'extended-ctc-fr',
        invoice: { number: 'INV-7' },
        verify: false,
      },
      files,
    );

    const sentBody = JSON.parse(bodyText(calls[0].body));
    expect(sentBody.facturxProfile).toBe('extended-ctc-fr');
  });
});

describe('runConvert', () => {
  it('passes the target format and writes the converted bytes to a file', async () => {
    const { client, calls } = clientReturning(
      () =>
        new Response('<ubl>converted</ubl>', {
          status: 200,
          headers: {
            'content-type': 'application/xml',
            'x-source-format': 'cii',
            'x-target-format': 'ubl',
          },
        }),
    );
    const { files, writes } = recordingFiles();

    const result = (await runConvert(
      client,
      {
        inputSource: 'text',
        documentText: '<cii/>',
        contentType: 'auto',
        sourceFormat: 'auto',
        targetFormat: 'ubl',
        dropFranceCtcOverlay: false,
      },
      files,
    )) as Record<string, unknown>;

    expect(calls[0].url).toContain('/v1/convert?');
    expect(calls[0].url).toContain('targetFormat=ubl');
    expect(writes[0].fileName).toBe('converted.xml');
    expect(result.targetFormat).toBe('ubl');
    expect(result.sourceFormat).toBe('cii');
  });
});

describe('resolveDocument', () => {
  it('rejects empty pasted text', () => {
    expect(() => resolveDocument({ inputSource: 'text', documentText: '   ' })).toThrow(
      /Paste the invoice XML/,
    );
  });

  it('rejects a File input with no file selected', () => {
    expect(() => resolveDocument({ inputSource: 'file' })).toThrow(/Select a file/);
  });
});

describe('resolveAuth', () => {
  it('reads the bare props shape (validate hook)', () => {
    expect(resolveAuth({ apiKey: 'k' })).toEqual({ apiKey: 'k' });
  });

  it('reads the wrapped props shape (action context)', () => {
    expect(resolveAuth({ type: 'CUSTOM_AUTH', props: { apiKey: 'k' } })).toEqual({ apiKey: 'k' });
  });
});

describe('option lists', () => {
  it('sources values straight from the SDK LIVE_* lists', () => {
    expect(STANDARD_OPTIONS.map((o) => o.value)).toEqual([
      'xrechnung',
      'zugferd',
      'facturx',
      'peppol-bis',
      'nlcius',
    ]);
    expect(VALIDATE_FORMAT_OPTIONS.map((o) => o.value)).toContain('auto');
    // A convert target can never be auto-detected.
    expect(CONVERT_TARGET_OPTIONS.map((o) => o.value)).not.toContain('auto');
  });

  it('offers each standard only the Factur-X profiles it accepts', () => {
    const values = (standard: string) => facturxProfileOptionsFor(standard).map((o) => o.value);
    expect(values('facturx')).toContain('extended-ctc-fr');
    expect(values('zugferd')).toEqual(['basicwl', 'en16931', 'extended']);
    // Outside the hybrid family there is no Factur-X profile to pick; NLCIUS
    // resolves to Peppol BIS and pins its own.
    expect(values('xrechnung')).toEqual([]);
    expect(values('peppol-bis')).toEqual([]);
    expect(values('nlcius')).toEqual([]);
  });

  // Drives the prop's own options callback, so this fails if the dropdown stops
  // refreshing on Standard or stops reading the per-standard list.
  it('narrows the profile dropdown when Standard changes', async () => {
    const prop = generateAction.props.facturxProfile;
    expect(prop.refreshers).toEqual(['standard']);
    const ctx = {} as Parameters<typeof prop.options>[1];

    const zugferd = await prop.options({ standard: 'zugferd' }, ctx);
    expect(zugferd.disabled).toBe(false);
    expect(zugferd.options.map((o) => o.value)).not.toContain('extended-ctc-fr');

    const xrechnung = await prop.options({ standard: 'xrechnung' }, ctx);
    expect(xrechnung.disabled).toBe(true);
    expect(xrechnung.options).toEqual([]);
  });
});

describe('asJsonObject / mapError', () => {
  it('parses a JSON string and drops empty objects', () => {
    expect(asJsonObject('{"a":1}')).toEqual({ a: 1 });
    expect(asJsonObject('{}')).toBeUndefined();
    expect(asJsonObject('')).toBeUndefined();
    expect(asJsonObject('not json')).toBeUndefined();
  });

  it('passes a plain Error through unchanged', () => {
    const e = new Error('boom');
    expect(mapError(e)).toBe(e);
  });

  it('names the failing rules a 422 carries, with the code still last', () => {
    const err = new BeliqApiError('Generated invoice failed validation', {
      code: 'INVALID_INVOICE',
      status: 422,
      details: {
        validationResult: {
          valid: false,
          errors: [
            { ruleId: 'BR-DE-2', severity: 'error', message: 'seller contact', location: '/Invoice' },
            { ruleId: 'BR-DE-1', severity: 'error', message: 'payment instructions' },
          ],
        },
      },
    });
    const message = mapError(err).message;
    expect(message).toContain('BR-DE-2 seller contact at /Invoice');
    expect(message).toContain('BR-DE-1 payment instructions');
    expect(message.endsWith('(INVALID_INVOICE)')).toBe(true);
  });

  it('truncates past five findings and says how many are hidden', () => {
    const err = new BeliqApiError('Generated invoice failed validation', {
      code: 'INVALID_INVOICE',
      status: 422,
      details: {
        validationResult: {
          errors: Array.from({ length: 8 }, (_, i) => ({ ruleId: `R-${i}`, message: `m${i}` })),
        },
      },
    });
    const message = mapError(err).message;
    expect(message).toContain('R-4 m4');
    expect(message).not.toContain('R-5');
    expect(message).toContain('(+3 more)');
  });

  it('leaves the message alone when there are no findings to add', () => {
    const err = new BeliqApiError('Monthly quota exceeded (20/20).', {
      code: 'QUOTA_EXCEEDED',
      status: 429,
    });
    // The live suite routes a spent quota by this exact suffix.
    expect(mapError(err).message).toBe('Monthly quota exceeded (20/20). (QUOTA_EXCEEDED)');
  });
});
