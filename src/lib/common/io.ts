// Document IO adapters between Activepieces props/files and the SDK. The SDK
// owns the wire format; these only move bytes in and out of the AP runtime.

/** The slice of `context.files` we use: write bytes, get back a file handle. */
export interface FilesWriter {
  write(params: { fileName: string; data: Buffer }): Promise<string>;
}

/** An Activepieces File prop value (ApFile), narrowed to the fields we read. */
interface ApFileLike {
  data?: Buffer | Uint8Array;
  base64?: string;
  filename?: string;
}

export interface ResolvedDocument {
  bytes: Buffer;
  /** Explicit content type, or undefined to let the SDK sniff XML vs PDF. */
  contentType?: string;
}

/**
 * Read the raw document bytes from the action props: either pasted text or a
 * File from a previous step. `contentType` of 'auto' defers detection to the
 * SDK (PDF magic vs XML); an explicit choice overrides it.
 */
export function resolveDocument(props: Record<string, unknown>): ResolvedDocument {
  const source = (props['inputSource'] as string) ?? 'text';
  let bytes: Buffer;

  if (source === 'file') {
    const file = props['documentFile'] as ApFileLike | undefined;
    if (file?.data) {
      bytes = Buffer.from(file.data);
    } else if (typeof file?.base64 === 'string' && file.base64.length > 0) {
      bytes = Buffer.from(file.base64, 'base64');
    } else {
      throw new Error('Select a file for the document, or switch Input to Text.');
    }
  } else {
    const text = ((props['documentText'] as string) ?? '').trim();
    if (!text) {
      throw new Error('Paste the invoice XML, or switch Input to File.');
    }
    bytes = Buffer.from(text, 'utf8');
  }

  if (bytes.length === 0) {
    throw new Error('The input document is empty.');
  }

  const selected = (props['contentType'] as string) ?? 'auto';
  return { bytes, contentType: selected === 'auto' ? undefined : selected };
}

interface DocumentResult {
  contentType: string;
  bytes: Uint8Array;
  meta: object;
}

/**
 * Write a document-producing op's bytes to an AP file and return the handle
 * plus the response metadata. The extension follows the response content type.
 */
export async function writeDocument(
  files: FilesWriter,
  result: DocumentResult,
  kind: 'invoice' | 'converted',
  filenameOverride?: string,
): Promise<Record<string, unknown>> {
  const contentType = result.contentType.split(';')[0].trim();
  const ext = contentType.includes('pdf') ? 'pdf' : 'xml';
  const fileName = filenameOverride || `${kind}.${ext}`;
  const file = await files.write({ fileName, data: Buffer.from(result.bytes) });
  const meta = Object.fromEntries(
    Object.entries(result.meta as Record<string, unknown>).filter(
      ([, value]) => value !== undefined,
    ),
  );
  return {
    success: true,
    file,
    fileName,
    contentType,
    sizeBytes: result.bytes.length,
    ...meta,
  };
}
