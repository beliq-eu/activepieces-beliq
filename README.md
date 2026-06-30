# activepieces-beliq

An [Activepieces](https://www.activepieces.com) community piece for [beliq](https://beliq.eu), a REST API that generates, validates, parses, and converts EU-compliant e-invoices (XRechnung, ZUGFeRD, Factur-X, Peppol BIS) against authority-pinned, drift-checked rules.

One piece, four actions:

- **Generate Invoice** - build a compliant document (XML or hybrid PDF/A-3) from an EN 16931 invoice object.
- **Validate Invoice** - check an XML or PDF invoice against the authority-pinned rules and get a structured verdict.
- **Parse Invoice** - extract a structured EN 16931 invoice object from an XML or PDF document.
- **Convert Invoice** - convert a document from one EN 16931 format to another.

beliq validates and produces the compliant document. Transmission, archiving, and tax reporting stay with your access point or ERP.

## Installation

In Activepieces: **Settings -> My Pieces -> Install Piece**, then enter the npm package name `activepieces-beliq`.

For a self-hosted instance you can also upload a built tarball via **Platform Admin -> Setup -> Pieces**.

## Connection

Create a **beliq** connection with an API key from [dashboard.beliq.eu](https://dashboard.beliq.eu) (API Keys). The connection test calls `GET /v1/me`, a no-quota credential check, so validating the connection never touches your monthly quota. Leave **Base URL** at the default unless you run a self-hosted or staging deployment.

## Document input

**Validate**, **Parse**, and **Convert** read the document from either a pasted **Text** field (the invoice XML) or a **File** from a previous step (XML or PDF). The **Content Type** auto-detects PDF vs XML from the bytes; set it explicitly to override.

**Generate** and **Convert** return the produced document as a **File** you can pass to the next step, alongside metadata (content type, size, and the response details: Schematron version, PDF kind, source/target format, lost elements). Generate also returns the XML text directly when the output is XML.

## Anything not in the UI?

Every action has an **Advanced (JSON)** field that is deep-merged into the request (the body for Generate, the query for Validate / Parse / Convert), so any API option not surfaced as a control is still reachable. The format dropdowns list the formats beliq offers publicly today; see the full request and response schema at [docs.beliq.eu](https://docs.beliq.eu).

## Example flows

Importable flow templates live in [`examples/`](./examples), one per use case. Import them via **Flows -> Import Flow**:

- `validate-xml-from-webhook.json` - validate an XML invoice received on a webhook.
- `generate-xrechnung-scheduled.json` - generate an XRechnung document on a schedule.
- `convert-ubl-to-zugferd.json` - convert a UBL invoice from a webhook into a ZUGFeRD hybrid PDF.

## Development

```bash
npm install
npm run build       # tsc -> dist/ + prepare-dist (publishable package layout)
npm run lint        # eslint
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
