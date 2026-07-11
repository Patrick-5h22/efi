// Vérifie que la couche serverless Better Auth se charge et est correctement
// configurée (sans se connecter à la base : le Pool pg est paresseux).

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.BETTER_AUTH_SECRET ||= 'secret-de-test-0123456789abcdef';
process.env.BETTER_AUTH_URL ||= 'https://exemple.test';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';
// Variables système Vercel simulées : le domaine de production doit être
// automatiquement de confiance (connexion depuis l'alias public, ex. efi-rho)
process.env.VERCEL_PROJECT_PRODUCTION_URL ||= 'efi-prod.test';
process.env.VERCEL_URL ||= 'efi-abc123-team.test';

const { auth } = await import('../api/_auth.js');

test('better-auth : instance opérationnelle', () => {
  assert.equal(typeof auth.handler, 'function', 'handler HTTP présent');
  assert.equal(typeof auth.api.getSession, 'function', 'api.getSession présent');
  assert.equal(typeof auth.api.signInEmail, 'function', 'connexion email/mot de passe active');
});

test('better-auth : options conformes à la référence efi-placement', () => {
  const o = auth.options;
  assert.equal(o.emailAndPassword.enabled, true);
  assert.equal(o.emailAndPassword.disableSignUp, true, 'pas d’inscription depuis cette application');
  assert.equal(o.emailAndPassword.minPasswordLength, 10);
  assert.equal(o.advanced.cookiePrefix, 'efi-planning');
  assert.equal(o.session.expiresIn, 60 * 60 * 24 * 7);
  assert.deepEqual(Object.keys(o.user.additionalFields).sort(), ['role', 'theme']);
  assert.equal(o.user.additionalFields.role.input, false, 'rôle non modifiable par le client');
});

test('better-auth : origines de confiance (URL configurée, production, déploiement)', () => {
  const origins = auth.options.trustedOrigins;
  assert.ok(origins.includes('https://exemple.test'), 'BETTER_AUTH_URL de confiance');
  assert.ok(origins.includes('https://efi-prod.test'), 'domaine de production Vercel de confiance');
  assert.ok(origins.includes('https://efi-abc123-team.test'), 'URL du déploiement courant de confiance');
});

test('better-auth : colonnes mappées en snake_case (tables drizzle d’efi-placement)', () => {
  const o = auth.options;
  assert.equal(o.user.fields.emailVerified, 'email_verified');
  assert.equal(o.user.fields.createdAt, 'created_at');
  assert.equal(o.session.fields.userId, 'user_id');
  assert.equal(o.session.fields.expiresAt, 'expires_at');
  assert.equal(o.account.fields.providerId, 'provider_id');
  assert.equal(o.account.fields.accessTokenExpiresAt, 'access_token_expires_at');
  assert.equal(o.verification.fields.expiresAt, 'expires_at');
});

test('routes serverless : modules importables', async () => {
  const authRoute = await import('../api/auth.js');
  assert.equal(typeof authRoute.default, 'function', 'handler /api/auth/* présent');
  assert.equal(authRoute.config.api.bodyParser, false, 'parseur de corps désactivé pour better-auth');

  const stateRoute = await import('../api/state.js');
  assert.equal(typeof stateRoute.default, 'function', 'handler /api/state présent');
});

test('vercel.json : toutes les routes /api/auth/* réécrites vers la fonction', async () => {
  const { readFile } = await import('node:fs/promises');
  const cfg = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.ok(
    cfg.rewrites?.some((r) => r.source === '/api/auth/:path*' && r.destination === '/api/auth'),
    'réécriture /api/auth/:path* → /api/auth présente (les segments multiples comme sign-in/email en dépendent)',
  );
});

test('/api/state : refuse sans session (401)', async () => {
  const stateRoute = await import('../api/state.js');
  let statusCode = null;
  let payload = null;
  const res = {
    status(c) { statusCode = c; return this; },
    json(p) { payload = p; return this; },
    setHeader() {},
  };
  // Requête sans cookie de session → getSession renvoie null sans toucher la base
  await stateRoute.default({ method: 'GET', headers: {} }, res);
  assert.equal(statusCode, 401);
  assert.match(payload.message, /authentification/i);
});
