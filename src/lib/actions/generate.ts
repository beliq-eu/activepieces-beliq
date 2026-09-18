import type { Beliq, FacturxProfile, GenerateInput, Invoice } from '@beliq/sdk';
import { createAction, Property } from '@activepieces/pieces-framework';
import { beliqAuth } from '../common/auth';
import { asJsonObject, createClient, mapError } from '../common/client';
import { type FilesWriter, writeDocument } from '../common/io';
import {
  facturxProfileOptionsFor,
  OUTPUT_OPTIONS,
  resolveGenerateTarget,
  STANDARD_OPTIONS,
  usableFacturxProfile,
} from '../common/options';

// The default the Activepieces form shows, and the fixture the live test
// generates. It is a valid XRechnung, which takes three fields past a bare
// EN 16931 invoice: the buyer's electronic address (BT-49, which beliq maps
// from `buyer.email`), seller contact details (BR-DE-2) and payment
// instructions (BR-DE-1). Drop any of them and `verify: true` answers 422.
export const SAMPLE_INVOICE = {
  number: 'INV-2026-001',
  issueDate: '2026-01-15',
  dueDate: '2026-02-14',
  currencyCode: 'EUR',
  buyerReference: 'LEITWEG-01',
  seller: {
    name: 'Seller GmbH',
    vatId: 'DE123456789',
    contactName: 'Anna Muster',
    email: 'billing@seller.example',
    phone: '+49 30 1234567',
    address: { street: 'Hauptstrasse 1', city: 'Berlin', postalCode: '10115', countryCode: 'DE' },
  },
  buyer: {
    name: 'Buyer GmbH',
    vatId: 'DE987654321',
    email: 'ap@buyer.example',
    address: { street: 'Marktplatz 2', city: 'Munich', postalCode: '80331', countryCode: 'DE' },
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
  const target = resolveGenerateTarget(props['standard'] as string);
  const input: GenerateInput = {
    standard: target.standard,
    invoice: (asJsonObject(props['invoice']) ?? {}) as Invoice,
    output: target.output ?? (props['output'] as 'xml' | 'pdf') ?? 'xml',
    verify: props['verify'] === true,
    advanced: asJsonObject(props['advanced']),
  };
  const facturxProfile = usableFacturxProfile(
    props['standard'] as string,
    props['facturxProfile'] as string | undefined,
  );
  if (target.profile) {
    input.profile = target.profile as GenerateInput['profile'];
  } else if (facturxProfile) {
    input.facturxProfile = facturxProfile as FacturxProfile;
  }
  const pdfTemplateId = ((props['pdfTemplateId'] as string) ?? '').trim();
  if (pdfTemplateId) {
    input.pdfTemplateId = pdfTemplateId;
  } else if (input.output === 'pdf') {
    // XRechnung and Peppol BIS have no hybrid PDF, and the API refuses PDF for
    // them unless the request names a visual to render. Factur-X and ZUGFeRD
    // render theirs either way, so this is inert for them.
    input.template = 'standard';
  }

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
      description:
        'XML returns the invoice as text. PDF returns a hybrid PDF/A-3 with the XML embedded for Factur-X and ZUGFeRD. XRechnung and Peppol BIS have no hybrid form, so PDF returns a visualization of the invoice with no XML inside it; the legal document for those two is the XML.',
      required: true,
      defaultValue: 'xml',
      options: { disabled: false, options: OUTPUT_OPTIONS },
    }),
    facturxProfile: Property.Dropdown({
      auth: undefined,
      displayName: 'Factur-X / ZUGFeRD Profile',
      description:
        'Applied only when Standard is Factur-X or ZUGFeRD. The choices follow the Standard: EXTENDED CTC FR is Factur-X only.',
      required: false,
      defaultValue: 'en16931',
      refreshers: ['standard'],
      options: async ({ standard }) => {
        const options = facturxProfileOptionsFor(standard as string | undefined);
        return options.length > 0
          ? { disabled: false, options }
          : { disabled: true, options: [], placeholder: 'Only used for Factur-X and ZUGFeRD' };
      },
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
      description:
        'Render the PDF visual from a saved dashboard template (PDF output only). Left empty, the built-in default visual is used.',
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
