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
// Application Entra ID simulée : la connexion Microsoft doit être configurée
process.env.MICROSOFT_CLIENT_ID ||= 'client-id-test';
process.env.MICROSOFT_CLIENT_SECRET ||= 'client-secret-test';
process.env.MICROSOFT_TENANT_ID ||= 'tenant-test';

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

test('better-auth : connexion Microsoft (Entra ID) configurée', () => {
  const o = auth.options;
  assert.equal(o.socialProviders.microsoft.clientId, 'client-id-test');
  assert.equal(o.socialProviders.microsoft.tenantId, 'tenant-test');
  assert.equal(o.account.accountLinking.enabled, true, 'liaison de comptes activée');
  assert.ok(o.account.accountLinking.trustedProviders.includes('microsoft'),
    'un compte existant (même email) est rattaché à son identité Microsoft');
});

test('better-auth : groupes Entra — accès et rôle appliqués à la connexion Microsoft', () => {
  const map = auth.options.socialProviders.microsoft.mapProfileToUser;
  assert.equal(typeof map, 'function');
  assert.equal(auth.options.socialProviders.microsoft.overrideUserInfo, true,
    'le rôle est resynchronisé à chaque connexion');

  const G1 = 'groupe-gestionnaires';
  const G2 = 'groupe-commerciaux';
  process.env.MICROSOFT_ALLOWED_GROUPS = `${G1},${G2}`;
  process.env.MICROSOFT_GROUP_ROLES = `${G1}:gestionnaire,${G2}:commercial`;
  try {
    // Membre d'un groupe autorisé → accepté, rôle déduit (le plus élevé)
    const u = map({ name: 'Test', email: 't@cipecma.com', groups: [G2, G1] });
    assert.equal(u.role, 'gestionnaire');
    // Membre d'aucun groupe autorisé → refusé
    assert.throws(() => map({ name: 'Intrus', email: 'i@cipecma.com', groups: ['autre'] }), /groupe autorisé/);
    assert.throws(() => map({ name: 'Sans groupe', email: 's@cipecma.com' }), /groupe autorisé/);
    // Sans restriction configurée → accepté, rôle inchangé (pas de champ role)
    delete process.env.MICROSOFT_ALLOWED_GROUPS;
    delete process.env.MICROSOFT_GROUP_ROLES;
    const u2 = map({ name: 'Libre', email: 'l@cipecma.com', groups: ['x'] });
    assert.equal(u2.role, undefined);
    assert.equal(u2.email, 'l@cipecma.com');
  } finally {
    delete process.env.MICROSOFT_ALLOWED_GROUPS;
    delete process.env.MICROSOFT_GROUP_ROLES;
  }
});

test('/api/config : expose la disponibilité de la connexion Microsoft', async () => {
  const { default: configHandler } = await import('../api/config.js');
  let payload = null;
  const res = { status() { return this; }, json(p) { payload = p; return this; }, setHeader() {} };
  configHandler({ method: 'GET' }, res);
  assert.equal(payload.microsoftAuth, true);
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

// La découverte OAuth se fait à la RACINE du domaine, pas sous le basePath de
// better-auth : RFC 9728 pour la ressource, RFC 8414 pour le serveur
// d'autorisation, toutes deux avec insertion du chemin après « .well-known ».
// Le défi WWW-Authenticate pointe littéralement vers
// /.well-known/oauth-protected-resource/api/mcp — vérifié en local contre une
// vraie base. Sans ces réécritures, le client MCP ne trouve rien et la panne
// est silencieuse : il abandonne l'autorisation sans message exploitable.
test('vercel.json : la découverte OAuth est routée depuis la racine', async () => {
  const { readFile } = await import('node:fs/promises');
  const cfg = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const vers = (source) => cfg.rewrites?.find((r) => r.source === source)?.destination;

  for (const source of [
    '/.well-known/oauth-protected-resource',
    '/.well-known/oauth-protected-resource/:path*',
    '/.well-known/oauth-authorization-server/:path*',
  ]) {
    assert.equal(vers(source), '/api/auth', `${source} doit être routé vers la fonction d’authentification`);
  }

  // Vercel valide ce fichier strictement : une entrée qui n'est pas un objet
  // { source, destination } fait échouer le déploiement entier.
  for (const r of cfg.rewrites || []) {
    assert.equal(typeof r, 'object', 'chaque réécriture est un objet, jamais une chaîne');
    assert.ok(r.source && r.destination, 'chaque réécriture porte source et destination');
  }
});

// « cleanUrls » transforme chaque fichier .html en REDIRECTION 308 vers son
// chemin sans extension : /consent.html répond 308 vers /consent, et n'est
// donc pas une page servie. Une réécriture qui vise un .html pointe alors
// vers une redirection, et Vercel rend 404.
//
// C'est exactement ce qui est arrivé à /login → /consent.html : la découverte
// OAuth fonctionnait, le consentement aussi, mais la page de connexion — la
// première que voit un utilisateur non connecté — répondait 404. Le connecteur
// MCP s'arrêtait là, sur un écran « This page doesn't exist ».
test('vercel.json : aucune réécriture ne vise un .html quand cleanUrls est actif', async () => {
  const { readFile } = await import('node:fs/promises');
  const cfg = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  if (!cfg.cleanUrls) return;

  const fautives = (cfg.rewrites || []).filter((r) => r.destination.endsWith('.html'));
  assert.deepEqual(fautives, [],
    'avec cleanUrls, la destination doit être le chemin propre (/consent) et non le fichier (/consent.html)');

  // Et la page de connexion doit bien être routée : sans elle, l'autorisation
  // OAuth s'interrompt avant même de commencer.
  const vers = (cfg.rewrites || []).find((r) => r.source === '/login')?.destination;
  assert.equal(vers, '/consent', 'la page de connexion OAuth doit être servie');
});

// Réponse Vercel simulée : on ne retient que ce que les routes en font.
function reponse() {
  const r = {
    code: null,
    corps: null,
    status(c) { r.code = c; return r; },
    json(p) { r.corps = p; return r; },
    setHeader() { return r; },
  };
  return r;
}

// getSession remplacé le temps d'un test. L'objet auth étant partagé par
// import, les routes voient le remplacement sans injection de dépendance.
async function avecSession(faux, fn) {
  const vrai = auth.api.getSession;
  auth.api.getSession = faux;
  try {
    await fn();
  } finally {
    auth.api.getSession = vrai;
  }
}

for (const [nom, module] of [['/api/state', '../api/state.js'], ['/api/prefs', '../api/prefs.js']]) {
  test(`${nom} : sans session, 401 — jamais d’accès`, async () => {
    const route = await import(module);
    const res = reponse();
    await avecSession(async () => null, async () => {
      await route.default({ method: 'GET', headers: {} }, res);
    });
    assert.equal(res.code, 401);
    assert.match(res.corps.message, /authentification/i);
  });

  // Une panne de la base d'authentification n'est pas un refus, et ne doit pas
  // non plus laisser fuir la trace d'exécution de better-auth en 500.
  test(`${nom} : base d’authentification injoignable → 503 explicite`, async () => {
    const route = await import(module);
    const res = reponse();
    await avecSession(
      async () => { throw new Error('connect ECONNREFUSED 127.0.0.1:5432'); },
      async () => { await route.default({ method: 'GET', headers: {} }, res); },
    );
    assert.equal(res.code, 503, 'indisponibilité, pas erreur serveur');
    assert.match(res.corps.message, /authentification indisponible/i);
    assert.equal(typeof res.corps.message, 'string');
    assert.ok(!('stack' in res.corps), 'aucune trace d’exécution dans la réponse');
  });

  // Sans stub, avec le vrai better-auth et DATABASE_URL sur un port fermé.
  // Peu importe que la version amont interroge la base sans cookie (1.7) ou
  // réponde sans y toucher (1.6) : dans les deux cas la route doit rendre un
  // refus ou une indisponibilité, jamais un accès ni une exception qui remonte.
  // C'est exactement ce qui a cassé au passage de better-auth 1.6 à 1.7.
  test(`${nom} : requête anonyme réelle — ni accès, ni exception`, async () => {
    const route = await import(module);
    const res = reponse();
    await route.default({ method: 'GET', headers: {} }, res);
    assert.ok([401, 503].includes(res.code), `code maîtrisé attendu, reçu ${res.code}`);
    assert.equal(typeof res.corps?.message, 'string', 'message JSON exploitable');
  });

  // Le point d'entrée doit être le même partout : une route qui appellerait
  // getSession en direct retomberait dans le 500 non maîtrisé.
  test(`${nom} : passe par sessionDeLaRequete`, async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL(module, import.meta.url), 'utf8');
    assert.match(src, /sessionDeLaRequete\(req\)/, 'session lue par le point d’entrée commun');
    assert.ok(!/auth\.api\.getSession/.test(src), 'pas d’appel direct à getSession');
  });
}
