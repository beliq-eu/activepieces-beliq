# activepieces-beliq

An [Activepieces](https://www.activepieces.com) community piece for [beliq](https://beliq.eu), a REST API that generates, validates, parses, and converts EU-compliant e-invoices (XRechnung, ZUGFeRD, Factur-X, Peppol BIS) against authority-pinned, drift-checked rules.

One piece, four actions:

- **Generate Invoice** - build a compliant document (XML or PDF) from an EN 16931 invoice object.
- **Validate Invoice** - check an XML or PDF invoice against the authority-pinned rules and get a structured verdict.
- **Parse Invoice** - extract a structured EN 16931 invoice object from an XML or PDF document.
- **Convert Invoice** - convert a document from one EN 16931 format to another.

beliq validates and produces the compliant document. Transmission, archiving, and tax reporting stay with your access point or ERP.

## Installation

In Activepieces: **Settings -> My Pieces -> Install Piece**, then enter the npm package name `activepieces-beliq`.

For a self-hosted instance you can also upload a built tarball via **Platform Admin -> Setup -> Pieces**.

## Connection

Create a **beliq** connection with an API key from [dashboard.beliq.eu](https://dashboard.beliq.eu) (API Keys). The connection test calls `GET /v1/me`, a no-quota credential check, so validating the connection never touches your monthly quota.

## Document input

**Validate**, **Parse**, and **Convert** read the document from either a pasted **Text** field (the invoice XML) or a **File** from a previous step (XML or PDF). The **Content Type** auto-detects PDF vs XML from the bytes; set it explicitly to override.

**Generate** and **Convert** return the produced document as a **File** you can pass to the next step, alongside metadata (content type, size, and the response details: Schematron version, PDF kind, source/target format, lost elements). Generate also returns the XML text directly when the output is XML.

## Anything not in the UI?

Every action has an **Advanced (JSON)** field that is deep-merged into the request (the body for Generate, the query for Validate / Parse / Convert), so any API option not surfaced as a control is still reachable. The format dropdowns list the formats beliq offers publicly today; see the full request and response schema at [docs.beliq.eu](https://docs.beliq.eu).

## Format coverage

The Standard dropdown of **Generate Invoice** carries every standard `POST /v1/generate` accepts, plus the NLCIUS profile of Peppol BIS. `GET https://api.beliq.eu/v1/rulesets` publishes each format with a badge saying how deep its check goes:

- **Authority-checked** (the authority's own rules): XRechnung, ZUGFeRD, Factur-X, Peppol BIS and NLCIUS.
- **Schema-checked** (structure only, no business rules): FatturaPA, Facturae, e-SLOG and KSeF FA(3). Their authority publishes no machine-readable business rules.

A national standard reads fields of its own from the **Invoice (JSON)** object. The [generate reference](https://docs.beliq.eu/api-reference/generate/) lists them, and the [format reference](https://docs.beliq.eu/format-reference/overview/) has a page per country.

KSeF FA(3) generation covers ordinary VAT invoices in PLN between Polish parties, at VAT rates 23, 22, 8, 7 and 5. The [Poland KSeF FA(3) reference](https://docs.beliq.eu/format-reference/poland/) states the full scope.

beliq generates and validates the document. Transmission (Peppol, PDP, KSeF, SDI), archiving, and tax-authority reporting are separate and remain your access point's job: beliq does not operate KSeF submission, and no action of this piece sends or files an invoice.

Only ZUGFeRD and Factur-X have a hybrid PDF, a PDF/A-3 with the XML embedded. For the other standards, PDF output is a visualization with no XML inside it, and the legal document is the XML. NLCIUS always returns XML.

The **Convert Invoice** dropdowns are shorter than the Generate one because the API's own convert enums are: no national format is a conversion source or target.

## Example flows

Importable flow templates live in [`examples/`](./examples), one per use case. Import them via **Flows -> Import Flow**:

- `validate-xml-from-webhook.json` - validate an XML invoice received on a webhook.
- `generate-xrechnung-scheduled.json` - generate an XRechnung document on a schedule.
- `convert-ubl-to-zugferd.json` - convert a UBL invoice from a webhook into a ZUGFeRD hybrid PDF.

## Development

```bash
npm install
npm run build       # tsc -> dist/ + prepare-dist (publishable package layout)
npm run typecheck   # src as built (CommonJS), and the tests as vitest runs them (ESM)
npm run lint        # ESLint with type information, whole repository
npm test            # unit tests (connector mapping, output shaping, error handling)
npm run scrub:check # fail on em-dashes in UI/customer text
```

The connector is a thin adapter over the published [`@beliq/sdk`](https://www.npmjs.com/package/@beliq/sdk): the SDK owns the wire format, and the dropdown value-spaces come straight from its `LIVE_*` lists, so they stay in sync with what beliq offers publicly. The tests drive a real SDK client with an injected request recorder, so the prop-to-request mapping, response parsing, and output shaping are all covered.

Live smoke test against the real API (needs network access to api.beliq.eu and consumes quota):

```bash
BELIQ_API_KEY=... npm run test:integration
```

## License

[MIT](./LICENSE)
