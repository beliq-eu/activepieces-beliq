import type { Beliq, FacturxProfile, GenerateInput, Invoice, Standard } from '@beliq/sdk';
import { createAction, Property } from '@activepieces/pieces-framework';
import { beliqAuth } from '../common/auth';
import { asJsonObject, createClient, mapError } from '../common/client';
import { type FilesWriter, writeDocument } from '../common/io';
import { isFacturxFamily, OUTPUT_OPTIONS, PROFILE_OPTIONS, STANDARD_OPTIONS } from '../common/options';

const SAMPLE_INVOICE = {
  number: 'INV-2026-001',
  issueDate: '2026-01-15',
  dueDate: '2026-02-14',
  currencyCode: 'EUR',
  buyerReference: 'BUYER-REF-01',
  seller: {
    name: 'Seller GmbH',
    vatId: 'DE123456789',
    address: { street: 'Hauptstrasse 1', city: 'Berlin', postalCode: '10115', countryCode: 'DE' },
  },
  buyer: {
    name: 'Buyer SARL',
    vatId: 'FR12345678901',
    address: { street: 'Rue de la Paix 2', city: 'Paris', postalCode: '75002', countryCode: 'FR' },
  },
  lines: [
    {
      description: 'Consulting services',
      quantity: 10,
      unitCode: 'HUR',
      unitPrice: 100,
      lineTotal: 1000,
      vatRate: 19,
      vatCategoryCode: 'S',
    },
  ],
  taxSummary: [{ vatCategoryCode: 'S', vatRate: 19, taxableAmount: 1000, taxAmount: 190 }],
  paymentMeans: { typeCode: '58', iban: 'DE89370400440532013000' },
  totalNetAmount: 1000,
  totalTaxAmount: 190,
  totalGrossAmount: 1190,
};

export async function runGenerate(
  client: Beliq,
  props: Record<string, unknown>,
  files: FilesWriter,
): Promise<unknown> {
  const standard = props['standard'] as Standard;
  const input: GenerateInput = {
    standard,
    invoice: (asJsonObject(props['invoice']) ?? {}) as Invoice,
    output: (props['output'] as 'xml' | 'pdf') ?? 'xml',
    verify: props['verify'] === true,
    advanced: asJsonObject(props['advanced']),
  };
  if (isFacturxFamily(standard) && props['facturxProfile']) {
    input.facturxProfile = props['facturxProfile'] as FacturxProfile;
  }
  const pdfTemplateId = ((props['pdfTemplateId'] as string) ?? '').trim();
  if (pdfTemplateId) input.pdfTemplateId = pdfTemplateId;

  try {
    const result = await client.generate(input);
    const out = await writeDocument(files, result, 'invoice');
    if (result.xml) out['xml'] = result.xml;
    return out;
  } catch (error) {
    throw mapError(error);
  }
}

export const generateAction = createAction({
  auth: beliqAuth,
  name: 'generate_invoice',
  displayName: 'Generate Invoice',
  description:
    'Build a compliant e-invoice document (XML or hybrid PDF/A-3) from an EN 16931 invoice object.',
  props: {
    standard: Property.StaticDropdown({
      displayName: 'Standard',
      description: 'The e-invoice standard to generate.',
      required: true,
      defaultValue: 'xrechnung',
      options: { disabled: false, options: STANDARD_OPTIONS },
    }),
    output: Property.StaticDropdown({
      displayName: 'Output',
      description: 'XML for a pure e-invoice, or a hybrid PDF/A-3 with the XML embedded.',
      required: true,
      defaultValue: 'xml',
      options: { disabled: false, options: OUTPUT_OPTIONS },
    }),
    facturxProfile: Property.StaticDropdown({
      displayName: 'Factur-X / ZUGFeRD Profile',
      description: 'Applied only when Standard is Factur-X or ZUGFeRD.',
      required: false,
      defaultValue: 'en16931',
      options: { disabled: false, options: PROFILE_OPTIONS },
    }),
    invoice: Property.Json({
      displayName: 'Invoice (JSON)',
      description: 'The invoice object in beliq EN 16931 shape. See docs.beliq.eu.',
      required: true,
      defaultValue: SAMPLE_INVOICE,
    }),
    verify: Property.Checkbox({
      displayName: 'Validate Result',
      description: 'Validate the generated document before returning (fails closed on a bad result).',
      required: false,
      defaultValue: true,
    }),
    pdfTemplateId: Property.ShortText({
      displayName: 'PDF Template ID',
      description: 'Render the hybrid PDF from a saved dashboard template (PDF output only).',
      required: false,
    }),
    advanced: Property.Json({
      displayName: 'Advanced (JSON)',
      description: 'Raw fields deep-merged into the request body for any option not exposed above.',
      required: false,
      defaultValue: {},
    }),
  },
  async run(context) {
    return runGenerate(createClient(context.auth), context.propsValue, context.files);
  },
});
