import type { Beliq, ValidateFormat } from '@beliq/sdk';
import { createAction, Property } from '@activepieces/pieces-framework';
import { beliqAuth } from '../common/auth';
import { asJsonObject, createClient, mapError } from '../common/client';
import { resolveDocument } from '../common/io';
import { VALIDATE_FORMAT_OPTIONS } from '../common/options';
import { advancedProp, documentInputProps } from '../common/props';

export async function runValidate(client: Beliq, props: Record<string, unknown>): Promise<unknown> {
  const { bytes, contentType } = resolveDocument(props);
  try {
    return await client.validate(bytes, {
      format: props['format'] as ValidateFormat | undefined,
      franceCtc: props['franceCtc'] === true,
      contentType,
      advanced: asJsonObject(props['advanced']),
    });
  } catch (error) {
    throw mapError(error);
  }
}

export const validateAction = createAction({
  auth: beliqAuth,
  name: 'validate_invoice',
  displayName: 'Validate Invoice',
  description: 'Check an XML or PDF invoice against beliq authority-pinned rules.',
  props: {
    ...documentInputProps,
    format: Property.StaticDropdown({
      displayName: 'Format',
      description: 'Hint the expected syntax, or auto-detect from the document.',
      required: false,
      defaultValue: 'auto',
      options: { disabled: false, options: VALIDATE_FORMAT_OPTIONS },
    }),
    franceCtc: Property.Checkbox({
      displayName: 'Apply France CTC Overlay',
      description: 'Also apply the French CTC (Flux 2) Schematron overlay.',
      required: false,
      defaultValue: false,
    }),
    advanced: advancedProp,
  },
  async run(context) {
    return runValidate(createClient(context.auth), context.propsValue);
  },
});
