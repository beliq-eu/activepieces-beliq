import type {
  Beliq,
  ConvertOptions,
  ConvertSourceFormat,
  ConvertTargetFormat,
  FacturxProfile,
} from '@beliq/sdk';
import { createAction, Property } from '@activepieces/pieces-framework';
import { beliqAuth } from '../common/auth';
import { asJsonObject, createClient, mapError } from '../common/client';
import { type FilesWriter, resolveDocument, writeDocument } from '../common/io';
import {
  CONVERT_SOURCE_OPTIONS,
  CONVERT_TARGET_OPTIONS,
  isFacturxFamily,
  PROFILE_OPTIONS,
} from '../common/options';
import { advancedProp, documentInputProps } from '../common/props';

export async function runConvert(
  client: Beliq,
  props: Record<string, unknown>,
  files: FilesWriter,
): Promise<unknown> {
  const { bytes, contentType } = resolveDocument(props);
  const targetFormat = props['targetFormat'] as ConvertTargetFormat;
  const options: ConvertOptions = {
    targetFormat,
    sourceFormat: props['sourceFormat'] as ConvertSourceFormat | undefined,
    dropFranceCtcOverlay: props['dropFranceCtcOverlay'] === true,
    contentType,
    advanced: asJsonObject(props['advanced']),
  };
  if (isFacturxFamily(targetFormat) && props['targetProfile']) {
    options.targetProfile = props['targetProfile'] as FacturxProfile;
  }
  try {
    const result = await client.convert(bytes, options);
    return writeDocument(files, result, 'converted');
  } catch (error) {
    throw mapError(error);
  }
}

export const convertAction = createAction({
  auth: beliqAuth,
  name: 'convert_invoice',
  displayName: 'Convert Invoice',
  description: 'Convert an invoice document from one EN 16931 format to another.',
  props: {
    ...documentInputProps,
    sourceFormat: Property.StaticDropdown({
      displayName: 'Source Format',
      description: 'The source format, or auto-detect from the document.',
      required: false,
      defaultValue: 'auto',
      options: { disabled: false, options: CONVERT_SOURCE_OPTIONS },
    }),
    targetFormat: Property.StaticDropdown({
      displayName: 'Target Format',
      description: 'The format to convert the document to.',
      required: true,
      defaultValue: 'ubl',
      options: { disabled: false, options: CONVERT_TARGET_OPTIONS },
    }),
    targetProfile: Property.StaticDropdown({
      displayName: 'Target Profile',
      description: 'Applied only when Target Format is Factur-X or ZUGFeRD.',
      required: false,
      defaultValue: 'en16931',
      options: { disabled: false, options: PROFILE_OPTIONS },
    }),
    dropFranceCtcOverlay: Property.Checkbox({
      displayName: 'Drop France CTC Overlay',
      description: 'Drop the French CTC overlay when the target cannot carry it (lossy).',
      required: false,
      defaultValue: false,
    }),
    advanced: advancedProp,
  },
  async run(context) {
    return runConvert(createClient(context.auth), context.propsValue, context.files);
  },
});
