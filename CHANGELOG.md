# Changelog

This file starts at 0.3.0. An earlier version has a heading here only for a
breaking change; the rest of its changes are in the git history between the
version tags (https://github.com/beliq-eu/activepieces-beliq/tags). 0.1.0 is
on npm without a tag. Dates are the npm publish date, in UTC.

## 0.5.0 - 2026-11-17

- Each action retries an outage for up to 7.5 minutes, such as a 503
  `DATABASE_UNAVAILABLE` with `Retry-After: 30` or an API that cannot be
  reached, and each attempt ends after 90 seconds. So an action ends within
  9 minutes, inside the 10 minutes Activepieces gives a run. In 0.4.0 an
  outage was retried 3 times, about 2 minutes at `Retry-After: 30`. The
  README's "When beliq is unavailable" says why the 10 minutes are for the
  whole run, and why a step's Retry on Failure should stay off.
- When the outage lasts longer, the action fails with an error that starts
  with `beliq is unavailable for now`, says how many seconds to wait when
  beliq sent a `Retry-After`, and ends in the `(CODE)` when beliq answered
  with one. When the API could not be reached, the error says so and that
  beliq did not say when to try again. Any other error with
  a `Retry-After`, such as a 429 `RATE_LIMITED`, names the wait too.
- The connection test retries for 5 seconds only, so the connection dialog
  answers within 25 seconds. During an outage it says that beliq is
  unavailable and that the key was not checked.
- The piece is on `@beliq/sdk` 0.7, up from 0.6.
- The three example flows in `examples/` install the piece at `~0.5.0`.
- The package includes this changelog.

## 0.4.0 - 2026-11-16

- Breaking: Convert Invoice returns each `lostElements` entry as the object
  the API sends, with `path`, `value`, `reason`, `severity` and
  `acceptableLoss`. In 0.3.0 each entry was the text `[object Object]`. When
  the list would pass the API's 6 KB header cap, it holds one
  `{ truncated: true }` entry instead, and `lostElementsCount` stays the exact
  count. The piece is on `@beliq/sdk` 0.6, up from 0.5.
- The Format dropdown of Validate Invoice adds FatturaPA (Italy), Facturae
  (Spain), e-SLOG (Slovenia) and KSeF FA(3) (Poland), the formats
  `@beliq/sdk` 0.6 offers for validate.
- The README says that beliq covers three steps of an e-invoice: generate,
  validate, and deliver (in development). The piece runs the first two,
  parses and converts, and no action of it sends or files an invoice. Until
  delivery through beliq is available, transmission (Peppol, plateforme
  agréée, SDI) and tax-authority reporting stay with your access point or ERP.
  Archiving stays with you, and beliq does not operate KSeF submission.
- The three example flows in `examples/` install the piece at `~0.4.0`.

## 0.3.0 - 2026-10-26

- Generate Invoice returns the API's verdict on the invoice XML in
  `validationResult`, with the check depth the API states for it in
  `verificationBadgeLabel`. With Validate Result off, `validationResult.verified`
  is `false` and `valid` says nothing about the document.
- Generate Invoice returns `sha256`, the hash the API computed over the
  document it returned.
- The Standard dropdown of Generate Invoice adds FatturaPA (Italy), Facturae
  (Spain), e-SLOG (Slovenia) and KSeF FA(3) (Poland). KSeF FA(3)
  (provisional, structure-checked) is generated only within the scope that
  https://docs.beliq.eu/format-reference/poland/ states. Beliq does not operate
  KSeF submission: transmission via your chosen intermediary.

## 0.2.0 - 2026-07-24

- Breaking: the connection's `Base URL` field is removed. The piece always
  calls https://api.beliq.eu, and a connection is the API key alone.
