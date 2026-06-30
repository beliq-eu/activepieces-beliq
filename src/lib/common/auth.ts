import { BeliqApiError } from '@beliq/sdk';
import { PieceAuth, Property } from '@activepieces/pieces-framework';
import { createClient, resolveAuth } from './client';

const AUTH_GUIDE = `Get an API key from the beliq dashboard (dashboard.beliq.eu, API Keys).

The connection test calls GET /v1/me, a no-quota credential check, so validating never touches your monthly quota.

Leave **Base URL** at the default unless you run a self-hosted or staging deployment.`;

export const beliqAuth = PieceAuth.CustomAuth({
  description: AUTH_GUIDE,
  required: true,
  props: {
    apiKey: PieceAuth.SecretText({
      displayName: 'API Key',
      description: 'Your beliq API key from dashboard.beliq.eu (API Keys).',
      required: true,
    }),
    baseUrl: Property.ShortText({
      displayName: 'Base URL',
      description: 'Override only for a self-hosted or staging deployment.',
      required: false,
      defaultValue: 'https://api.beliq.eu',
    }),
  },
  validate: async ({ auth }) => {
    const { apiKey } = resolveAuth(auth);
    if (!apiKey) {
      return { valid: false, error: 'API key is required.' };
    }
    try {
      // GET /v1/me: 200 for a valid key, 401/403 for a bad one. No quota spent.
      await createClient(auth).me();
      return { valid: true };
    } catch (error) {
      const status = error instanceof BeliqApiError ? error.status : undefined;
      if (status === 401 || status === 403) {
        return { valid: false, error: 'Invalid beliq API key.' };
      }
      const detail = status ? `the API returned HTTP ${status}` : 'the API was unreachable';
      return {
        valid: false,
        error: `Could not validate the beliq API key (${detail}). Check the key and try again.`,
      };
    }
  },
});
