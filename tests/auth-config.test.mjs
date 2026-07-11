// Vérifie que la couche serverless Better Auth se charge et est correctement
// configurée (sans se connecter à la base : le Pool pg est paresseux).

import test from 'node:test';
import assert from 'node:assert/strict';

process.env.BETTER_AUTH_SECRET ||= 'secret-de-test-0123456789abcdef';
process.env.BETTER_AUTH_URL ||= 'https://exemple.test';
process.env.DATABASE_URL ||= 'postgresql://test:test@localhost:5432/test';

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

test('routes serverless : modules importables', async () => {
  const authRoute = await import('../api/auth/[...all].js');
  assert.equal(typeof authRoute.default, 'function', 'handler /api/auth/* présent');
  assert.equal(authRoute.config.api.bodyParser, false, 'parseur de corps désactivé pour better-auth');

  const stateRoute = await import('../api/state.js');
  assert.equal(typeof stateRoute.default, 'function', 'handler /api/state présent');
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
