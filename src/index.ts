import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { convertAction } from './lib/actions/convert';
import { generateAction } from './lib/actions/generate';
import { parseAction } from './lib/actions/parse';
import { validateAction } from './lib/actions/validate';
import { beliqAuth } from './lib/common/auth';

export const beliq = createPiece({
  displayName: 'beliq',
  description:
    'Generate, validate, parse, and convert EU-compliant e-invoices (XRechnung, ZUGFeRD, Factur-X, Peppol BIS) against authority-pinned, drift-checked rules.',
  auth: beliqAuth,
  minimumSupportedRelease: '0.82.0',
  logoUrl: 'https://beliq.eu/beliq-avatar.png',
  categories: [PieceCategory.ACCOUNTING, PieceCategory.CONTENT_AND_FILES],
  authors: ['beliq-eu'],
  actions: [generateAction, validateAction, parseAction, convertAction],
  triggers: [],
});
