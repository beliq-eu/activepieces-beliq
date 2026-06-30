import {
  LIVE_CONVERT_SOURCE_FORMATS,
  LIVE_CONVERT_TARGET_FORMATS,
  LIVE_GENERATE_STANDARDS,
  LIVE_PARSE_FORMATS,
  LIVE_PROFILES,
  LIVE_VALIDATE_FORMATS,
} from '@beliq/sdk';

// Dropdown value-spaces are sourced straight from the SDK's LIVE_* lists, which
// are the publicly-offered subset of the beliq coverage SSOT. Provisional
// formats the API can technically accept stay out of the UI (LPD-1); reach them
// through the Advanced (JSON) field. Labels here are cosmetic only.
const LABELS: Record<string, string> = {
  auto: 'Auto-detect',
  cii: 'CII',
  ubl: 'UBL',
  xrechnung: 'XRechnung',
  zugferd: 'ZUGFeRD',
  facturx: 'Factur-X',
  'peppol-bis': 'Peppol BIS',
  basicwl: 'BASIC WL',
  en16931: 'EN 16931',
  extended: 'EXTENDED',
  'extended-ctc-fr': 'EXTENDED CTC FR',
};

export interface Option {
  label: string;
  value: string;
}

export function toOptions(values: readonly string[]): Option[] {
  return values.map((value) => ({ label: LABELS[value] ?? value, value }));
}

export const STANDARD_OPTIONS = toOptions(LIVE_GENERATE_STANDARDS);
export const PROFILE_OPTIONS = toOptions(LIVE_PROFILES);
export const VALIDATE_FORMAT_OPTIONS = toOptions(LIVE_VALIDATE_FORMATS);
export const PARSE_FORMAT_OPTIONS = toOptions(LIVE_PARSE_FORMATS);
export const CONVERT_SOURCE_OPTIONS = toOptions(LIVE_CONVERT_SOURCE_FORMATS);
export const CONVERT_TARGET_OPTIONS = toOptions(LIVE_CONVERT_TARGET_FORMATS);

export const OUTPUT_OPTIONS: Option[] = [
  { label: 'XML', value: 'xml' },
  { label: 'PDF (Hybrid)', value: 'pdf' },
];

export const INPUT_SOURCE_OPTIONS: Option[] = [
  { label: 'Text (paste the XML)', value: 'text' },
  { label: 'File (from a previous step)', value: 'file' },
];

export const CONTENT_TYPE_OPTIONS: Option[] = [
  { label: 'Auto-detect', value: 'auto' },
  { label: 'XML', value: 'application/xml' },
  { label: 'PDF', value: 'application/pdf' },
];

/** Profiles only apply to the Factur-X / ZUGFeRD hybrid family. */
export function isFacturxFamily(standardOrFormat: string | undefined): boolean {
  return standardOrFormat === 'facturx' || standardOrFormat === 'zugferd';
}
