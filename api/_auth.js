// Better Auth — configuration partagée des fonctions serverless.
// Branché sur les MÊMES tables que efi-placement (user, session, account,
// verification — better-auth, tables au singulier) dans le Postgres du
// projet Supabase : les comptes et rôles sont communs aux deux applications.
//
// Variables d'environnement Vercel requises :
//   DATABASE_URL       chaîne de connexion Postgres (pooler de session Supabase)
//   BETTER_AUTH_SECRET secret de signature des sessions
//   EFI_ACCESS_CODE    code d'accès aux RPC planning (utilisé par api/state.js)
//   BETTER_AUTH_URL    (optionnel) URL publique — déduite automatiquement du
//                      domaine de production Vercel si absente

import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import pg from 'pg';
import { parseAllowedGroups, parseGroupRoles, isAllowed, roleFromGroups } from './_groups.js';

// Domaine de production (alias public, ex. efi-rho.vercel.app) et URL du
// déploiement courant (unique par déploiement) — fournis par Vercel.
const prodURL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null;
const deployURL = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;

const baseURL = process.env.BETTER_AUTH_URL || prodURL || deployURL || 'http://localhost:3000';

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

  // Connexion Microsoft (Entra ID) — active seulement si l'application Azure
  // est configurée (variables MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET,
  // et MICROSOFT_TENANT_ID pour restreindre au tenant CIPECMA).
  // Groupes Entra (optionnels, voir api/_groups.js) : accès réservé aux
  // membres des groupes autorisés + rôle déduit du groupe, resynchronisé
  // à chaque connexion.
  ...(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET ? {
    socialProviders: {
      microsoft: {
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        tenantId: process.env.MICROSOFT_TENANT_ID || 'common',
        prompt: 'select_account',
        // Réapplique le mapping (dont le rôle) à chaque connexion, pas
        // seulement à la création du compte
        overrideUserInfo: true,
        mapProfileToUser(profile) {
          const groups = profile.groups || [];
          const allowed = parseAllowedGroups(process.env.MICROSOFT_ALLOWED_GROUPS);
          if (!isAllowed(groups, allowed)) {
            throw new APIError('FORBIDDEN', {
              message: 'Accès refusé : votre compte Microsoft n’appartient à aucun groupe autorisé.',
            });
          }
          const role = roleFromGroups(groups, parseGroupRoles(process.env.MICROSOFT_GROUP_ROLES));
          return {
            name: profile.name,
            email: profile.email,
            ...(role ? { role } : {}),
          };
        },
      },
    },
  } : {}),

  // efi-placement écrit ces tables via drizzle en colonnes snake_case ;
  // better-auth branché en direct sur Postgres attend du camelCase →
  // mapping explicite de chaque champ vers la colonne réelle.
  user: {
    fields: {
      emailVerified: 'email_verified',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    // Champs additionnels identiques à efi-placement (lecture seule ici)
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

  account: {
    // Liaison automatique : un utilisateur existant (email vérifié identique)
    // qui arrive via Microsoft est rattaché à son compte — pas de doublon.
    accountLinking: {
      enabled: true,
      trustedProviders: ['microsoft'],
    },
    fields: {
      userId: 'user_id',
      accountId: 'account_id',
      providerId: 'provider_id',
      accessToken: 'access_token',
      refreshToken: 'refresh_token',
      idToken: 'id_token',
      accessTokenExpiresAt: 'access_token_expires_at',
      refreshTokenExpiresAt: 'refresh_token_expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  verification: {
    fields: {
      expiresAt: 'expires_at',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  },

  session: {
    fields: {
      userId: 'user_id',
      expiresAt: 'expires_at',
      ipAddress: 'ip_address',
      userAgent: 'user_agent',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
    expiresIn: 60 * 60 * 24 * 7, // 7 jours, comme la référence
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 30 },
  },

  advanced: {
    cookiePrefix: 'efi-planning',
    useSecureCookies: process.env.NODE_ENV === 'production' || !!process.env.VERCEL,
  },

  // Origines acceptées : URL configurée, domaine de production et URL du
  // déploiement courant (permet aussi de tester l'auth sur les previews).
  trustedOrigins: [...new Set([baseURL, prodURL, deployURL].filter(Boolean))],
});
