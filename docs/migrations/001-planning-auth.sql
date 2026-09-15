-- Migration 001 — schéma planning_auth : tables du serveur d'autorisation OAuth
--
-- À APPLIQUER À LA MAIN sur le Postgres Supabase, après relecture.
-- Généré par la machinerie de migration de Better Auth (getMigrations) et
-- vérifié sur une instance PostgreSQL 16 locale, pas écrit à la main.
--
-- POURQUOI UN SCHÉMA SÉPARÉ
--   Ce Postgres est partagé avec efi-placement. Les tables user, session,
--   account et verification lui appartiennent autant qu'à nous : elles ne
--   bougent pas. Les huit tables ci-dessous sont propres à la planification,
--   elles vivent donc à part. api/_auth.js ouvre ses connexions avec
--   « -c search_path=planning_auth,public » : les nouvelles tables sont
--   résolues ici, les partagées continuent de l'être dans public.
--
-- LES RÉFÉRENCES CROISÉES SONT QUALIFIÉES
--   Six clés étrangères pointent vers public."user" et public."session".
--   Le search_path suffirait à les résoudre, mais une table homonyme créée
--   un jour dans planning_auth les redirigerait en silence. On qualifie.
--
-- CE QUE ÇA NE FAIT PAS
--   Aucune table existante n'est modifiée, aucune donnée n'est touchée.
--   Rien n'est actif tant que la variable MCP_OAUTH ne vaut pas « 1 » sur
--   Vercel : le code fonctionne aujourd'hui sans ces tables.
--
-- L'ORDRE COMPTE, ET IL N'EST PAS RATTRAPABLE À CHAUD
--   CE FICHIER D'ABORD, LA VARIABLE MCP_OAUTH ENSUITE.
--   Better Auth 1.7 contrôle le schéma au démarrage et lève une exception
--   NON CAPTURÉE si une table ou une colonne manque. Comme api/_auth.js est
--   importé par /api/state, /api/prefs et /api/auth, mettre MCP_OAUTH à « 1 »
--   avant d'avoir appliqué ce fichier ne casserait pas seulement le MCP :
--   ça couperait l'authentification de toute l'application. Vérifié en
--   local — l'exception passe à travers le filet posé sur $context, qui ne
--   couvre que les pannes de connexion.
--
-- POUR REVENIR EN ARRIÈRE
--   drop schema planning_auth cascade;
--   (et remettre MCP_OAUTH à autre chose que « 1 »)

create schema if not exists planning_auth;
set search_path to planning_auth, public;

-- jwks — Clés de signature des jetons d'accès. Publiées en lecture seule
--   sur /api/auth/jwks, la route MCP s'en sert pour vérifier une signature.
create table "jwks" ("id" text not null primary key, "publicKey" text not null, "privateKey" text not null, "createdAt" timestamptz not null, "expiresAt" timestamptz, "alg" text, "crv" text);

-- oauthClient — Un client déclaré = une application autorisée à demander des jetons.
--   Claude en crée un tout seul au raccordement (enregistrement dynamique).
create table "oauthClient" ("id" text not null primary key, "clientId" text not null unique, "clientSecret" text, "clientDiscoveryId" text, "disabled" boolean, "skipConsent" boolean, "enableEndSession" boolean, "subjectType" text, "scopes" jsonb, "clientCredentialsScopes" jsonb, "userId" text references public."user" ("id") on delete cascade, "createdAt" timestamptz, "updatedAt" timestamptz, "name" text, "uri" text, "icon" text, "contacts" jsonb, "tos" text, "policy" text, "softwareId" text, "softwareVersion" text, "softwareStatement" text, "redirectUris" jsonb not null, "postLogoutRedirectUris" jsonb, "backchannelLogoutUri" text, "backchannelLogoutSessionRequired" boolean, "tokenEndpointAuthMethod" text, "applicationType" text, "jwks" text, "jwksUri" text, "grantTypes" jsonb, "responseTypes" jsonb, "requirePKCE" boolean, "dpopBoundAccessTokens" boolean, "referenceId" text, "metadata" jsonb);

-- oauthResource — La ressource protégée, ici https://<domaine>/api/mcp. Les jetons
--   émis y sont liés par leur audience : un jeton pour une autre ressource
--   est refusé.
create table "oauthResource" ("id" text not null primary key, "identifier" text not null unique, "name" text not null, "accessTokenTtl" integer, "refreshTokenTtl" integer, "signingAlgorithm" text, "signingKeyId" text, "allowedScopes" jsonb, "customClaims" jsonb, "dpopBoundAccessTokensRequired" boolean, "disabled" boolean, "createdAt" timestamptz, "updatedAt" timestamptz, "policyVersion" integer, "metadata" jsonb);

-- oauthClientResource — Quel client a le droit de demander des jetons pour quelle
--   ressource.
create table "oauthClientResource" ("id" text not null primary key, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "resourceId" text not null references "oauthResource" ("identifier") on delete cascade, "metadata" jsonb, "createdAt" timestamptz);

-- oauthRefreshToken — Jetons de rafraîchissement, avec rotation et détection de rejeu.
create table "oauthRefreshToken" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "sessionId" text references public."session" ("id") on delete set null, "userId" text not null references public."user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "expiresAt" timestamptz not null, "createdAt" timestamptz not null, "revoked" timestamptz, "rotatedAt" timestamptz, "rotationReplayResponse" text, "rotationReplayExpiresAt" timestamptz, "authTime" timestamptz, "confirmation" jsonb, "scopes" jsonb not null);

-- oauthAccessToken — Jetons d'accès émis, pour pouvoir les révoquer et les inspecter.
create table "oauthAccessToken" ("id" text not null primary key, "token" text not null unique, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "sessionId" text references public."session" ("id") on delete set null, "userId" text references public."user" ("id") on delete cascade, "referenceId" text, "authorizationCodeId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "refreshId" text references "oauthRefreshToken" ("id") on delete cascade, "expiresAt" timestamptz not null, "createdAt" timestamptz not null, "revoked" timestamptz, "confirmation" jsonb, "scopes" jsonb not null);

-- oauthConsent — Ce que chaque utilisateur a accepté d'accorder à chaque client.
--   C'est ce qui rend le consentement révocable sans couper tout le monde.
create table "oauthConsent" ("id" text not null primary key, "clientId" text not null references "oauthClient" ("clientId") on delete cascade, "userId" text references public."user" ("id") on delete cascade, "referenceId" text, "resources" jsonb, "requestedUserInfoClaims" jsonb, "scopes" jsonb not null, "createdAt" timestamptz not null, "updatedAt" timestamptz not null);

-- oauthClientAssertion — Assertions de clients confidentiels (JWT). Inutilisée tant
--   que les clients sont publics, mais le fournisseur l'attend.
create table "oauthClientAssertion" ("id" text not null primary key, "expiresAt" timestamptz not null);

create index "oauthClient_userId_idx" on "oauthClient" ("userId");

create index "oauthClientResource_clientId_idx" on "oauthClientResource" ("clientId");

create index "oauthClientResource_resourceId_idx" on "oauthClientResource" ("resourceId");

create index "oauthRefreshToken_clientId_idx" on "oauthRefreshToken" ("clientId");

create index "oauthRefreshToken_sessionId_idx" on "oauthRefreshToken" ("sessionId");

create index "oauthRefreshToken_userId_idx" on "oauthRefreshToken" ("userId");

create index "oauthRefreshToken_authorizationCodeId_idx" on "oauthRefreshToken" ("authorizationCodeId");

create index "oauthAccessToken_clientId_idx" on "oauthAccessToken" ("clientId");

create index "oauthAccessToken_sessionId_idx" on "oauthAccessToken" ("sessionId");

create index "oauthAccessToken_userId_idx" on "oauthAccessToken" ("userId");

create index "oauthAccessToken_authorizationCodeId_idx" on "oauthAccessToken" ("authorizationCodeId");

create index "oauthAccessToken_refreshId_idx" on "oauthAccessToken" ("refreshId");

create index "oauthConsent_clientId_idx" on "oauthConsent" ("clientId");

create index "oauthConsent_userId_idx" on "oauthConsent" ("userId");

create unique index "oauthClientResource_clientId_resourceId_uidx" on "oauthClientResource" ("clientId", "resourceId");
