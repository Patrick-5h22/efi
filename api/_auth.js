// Better Auth — configuration partagée des fonctions serverless.
// Branché sur les MÊMES tables que efi-placement (user, session, account,
// verification — better-auth, tables au singulier) dans le Postgres du
// projet Supabase : les comptes et rôles sont communs aux deux applications.
//
// Variables d'environnement Vercel requises :
//   DATABASE_URL       chaîne de connexion Postgres (pooler de session Supabase)
//   BETTER_AUTH_SECRET secret de signature des sessions
//   BETTER_AUTH_URL    URL publique du site (ex. https://efi-sand.vercel.app)
//   EFI_ACCESS_CODE    code d'accès aux RPC planning (utilisé par api/state.js)

import { betterAuth } from 'better-auth';
import pg from 'pg';

const baseURL = process.env.BETTER_AUTH_URL
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export const auth = betterAuth({
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,

  database: new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1, // serverless : une connexion par instance
  }),

  emailAndPassword: {
    enabled: true,
    // Les comptes se créent dans efi-placement — pas d'inscription ici
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },

  // Champs additionnels identiques à efi-placement (lecture seule ici)
  user: {
    additionalFields: {
      role: {
        type: ['commercial', 'assistante', 'gestionnaire'],
        required: true,
        defaultValue: 'commercial',
        input: false,
      },
      theme: {
        type: ['teal', 'neutral', 'rose', 'orange', 'green', 'blue', 'violet', 'red', 'yellow'],
        required: true,
        defaultValue: 'teal',
        input: false,
      },
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 jours, comme la référence
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 30 },
  },

  advanced: {
    cookiePrefix: 'efi-planning',
    useSecureCookies: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
  },

  trustedOrigins: [
    baseURL,
    'https://efi-sand.vercel.app',
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ],
});
