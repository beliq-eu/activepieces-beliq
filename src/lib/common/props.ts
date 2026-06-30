import { Property } from '@activepieces/pieces-framework';
import { CONTENT_TYPE_OPTIONS, INPUT_SOURCE_OPTIONS } from './options';

// Shared document-input controls for the raw-input ops (validate / parse /
// convert). Activepieces has no conditional show/hide, so both the Text and
// File inputs are always present and resolved at run time by Input Source.
export const documentInputProps = {
  inputSource: Property.StaticDropdown({
    displayName: 'Input',
    description: 'Where to read the document from.',
    required: true,
    defaultValue: 'text',
    options: { disabled: false, options: INPUT_SOURCE_OPTIONS },
  }),
  documentText: Property.LongText({
    displayName: 'Document Text',
    description: 'The invoice XML as text (used when Input is Text).',
    required: false,
  }),
  documentFile: Property.File({
    displayName: 'Document File',
    description: 'An XML or PDF invoice file from a previous step (used when Input is File).',
    required: false,
  }),
  contentType: Property.StaticDropdown({
    displayName: 'Content Type',
    description: 'Content type of the input document, or auto-detect from its bytes.',
    required: false,
    defaultValue: 'auto',
    options: { disabled: false, options: CONTENT_TYPE_OPTIONS },
  }),
};

export const advancedProp = Property.Json({
  displayName: 'Advanced (JSON)',
  description: 'Raw fields deep-merged into the request query for any option not exposed above.',
  required: false,
  defaultValue: {},
});
