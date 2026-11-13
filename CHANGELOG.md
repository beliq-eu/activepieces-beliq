# Changelog

This file starts at 0.3.0. An earlier version has a heading here only for a
breaking change; the rest of its changes are in the git history between the
version tags (https://github.com/beliq-eu/activepieces-beliq/tags). 0.1.0 is
on npm without a tag. Dates are the npm publish date, in UTC.

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
