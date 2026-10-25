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
    'Validate, generate, convert and parse EU e-invoices with the beliq API.',
  auth: beliqAuth,
  minimumSupportedRelease: '0.82.0',
  logoUrl: 'https://beliq.eu/beliq-avatar-light.png',
  categories: [PieceCategory.ACCOUNTING, PieceCategory.CONTENT_AND_FILES],
  authors: ['beliq-eu'],
  actions: [generateAction, validateAction, parseAction, convertAction],
  triggers: [],
});
