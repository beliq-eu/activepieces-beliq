import type { Beliq, ParseFormat } from '@beliq/sdk';
import { createAction, Property } from '@activepieces/pieces-framework';
import { beliqAuth } from '../common/auth';
import { asJsonObject, createClient, mapError } from '../common/client';
import { resolveDocument } from '../common/io';
import { PARSE_FORMAT_OPTIONS } from '../common/options';
import { advancedProp, documentInputProps } from '../common/props';

export async function runParse(client: Beliq, props: Record<string, unknown>): Promise<unknown> {
  const { bytes, contentType } = resolveDocument(props);
  try {
    return await client.parse(bytes, {
      format: props['format'] as ParseFormat | undefined,
      contentType,
      advanced: asJsonObject(props['advanced']),
    });
  } catch (error) {
    throw mapError(error);
  }
}

export const parseAction = createAction({
  auth: beliqAuth,
  name: 'parse_invoice',
  displayName: 'Parse Invoice',
  description: 'Extract a structured EN 16931 invoice object from an XML or PDF document.',
  props: {
    ...documentInputProps,
    format: Property.StaticDropdown({
      displayName: 'Format',
      description: 'Hint the expected syntax, or auto-detect from the document.',
      required: false,
      defaultValue: 'auto',
      options: { disabled: false, options: PARSE_FORMAT_OPTIONS },
    }),
    advanced: advancedProp,
  },
  async run(context) {
    return runParse(createClient(context.auth), context.propsValue);
  },
});
