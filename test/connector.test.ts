import { describe, expect, it } from 'vitest';
import { Beliq } from '@beliq/sdk';
import { runGenerate } from '../src/lib/actions/generate';
import { runValidate } from '../src/lib/actions/validate';
import { runParse } from '../src/lib/actions/parse';
import { runConvert } from '../src/lib/actions/convert';
import { asJsonObject, mapError, resolveAuth } from '../src/lib/common/client';
import { resolveDocument, type FilesWriter } from '../src/lib/common/io';
import {
  CONVERT_TARGET_OPTIONS,
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
    expect(resolveAuth({ apiKey: 'k', baseUrl: 'https://x' })).toEqual({
      apiKey: 'k',
      baseUrl: 'https://x',
    });
  });

  it('reads the wrapped props shape (action context)', () => {
    expect(resolveAuth({ type: 'CUSTOM_AUTH', props: { apiKey: 'k', baseUrl: '' } })).toEqual({
      apiKey: 'k',
      baseUrl: '',
    });
  });
});

describe('option lists', () => {
  it('sources values straight from the SDK LIVE_* lists', () => {
    expect(STANDARD_OPTIONS.map((o) => o.value)).toEqual([
      'xrechnung',
      'zugferd',
      'facturx',
      'peppol-bis',
    ]);
    expect(VALIDATE_FORMAT_OPTIONS.map((o) => o.value)).toContain('auto');
    // A convert target can never be auto-detected.
    expect(CONVERT_TARGET_OPTIONS.map((o) => o.value)).not.toContain('auto');
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
});
