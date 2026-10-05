// Le diagnostic des bornes de la connexion Microsoft.
//
// Ce qu'il doit attraper, et que « la variable est renseignée » ne dit pas :
// « common » est renseignée et n'enferme rien. Le piège de ces deux variables
// est qu'elles échouent vers le plus permissif sans jamais lever d'erreur ;
// un test qui se contenterait de vérifier qu'elles sont non vides serait du
// même aveuglement que le bug.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  masquer, diagnostiquerTenant, diagnostiquerGroupes, diagnostiquerEntra,
} from '../api/_entra-diag.js';

const ACTIF = { MICROSOFT_CLIENT_ID: 'id', MICROSOFT_CLIENT_SECRET: 'secret' };
const TENANT = '72f988bf-86f1-41af-91ab-2d7cd011db47';

// --- Ne jamais rendre une valeur entière ---------------------------------

test('masquer : les premiers caractères et la longueur, pas la valeur', () => {
  assert.equal(masquer('72f988bf-86f1-41af-91ab-2d7cd011db47'), '72f988bf… (36 car.)');
  // Une valeur plus courte que la fenêtre est déjà sans secret.
  assert.equal(masquer('abc'), 'abc');
  assert.equal(masquer(''), null);
  assert.equal(masquer(null), null);
});

test('le diagnostic ne laisse filtrer aucune valeur complète', () => {
  const secret = '0123456789abcdef0123456789abcdef';
  const d = diagnostiquerEntra({ ...ACTIF, MICROSOFT_TENANT_ID: TENANT, MICROSOFT_ALLOWED_GROUPS: secret });
  const rendu = JSON.stringify(d);
  assert.ok(!rendu.includes(secret), 'le groupe entier ne doit pas sortir');
  assert.ok(!rendu.includes(TENANT), 'le tenant entier non plus');
});

// --- Le tenant ------------------------------------------------------------

test('tenant : un GUID restreint à une organisation', () => {
  const t = diagnostiquerTenant(TENANT);
  assert.equal(t.restreint, true);
  assert.equal(t.forme, 'identifiant de tenant (GUID)');
});

test('tenant : un domaine restreint aussi', () => {
  assert.equal(diagnostiquerTenant('cipecma.onmicrosoft.com').restreint, true);
});

test('tenant : « common » est renseigné et n’enferme rien', () => {
  // Le cœur du diagnostic : une valeur présente, et pourtant grande ouverte.
  for (const v of ['common', 'COMMON', ' organizations ', 'consumers']) {
    const t = diagnostiquerTenant(v);
    assert.equal(t.renseignee, true, v);
    assert.equal(t.restreint, false, v);
  }
});

test('tenant : absent, le code retombe sur « common » — il faut le dire', () => {
  const t = diagnostiquerTenant(undefined);
  assert.equal(t.renseignee, false);
  assert.equal(t.restreint, false);
  assert.match(t.effet, /common/);
  assert.equal(diagnostiquerTenant('   ').renseignee, false, 'des espaces ne valent pas une valeur');
});

test('tenant : une valeur méconnaissable ne compte pas comme une barrière', () => {
  // Entra la refusera : la compter comme restrictive donnerait un « OK »
  // pour un déploiement qui ne laisse en fait entrer personne.
  const t = diagnostiquerTenant('tenant-de-test');
  assert.equal(t.restreint, false);
  assert.equal(t.forme, 'valeur inattendue');
});

// --- Les groupes ----------------------------------------------------------

test('groupes : une liste vide ne filtre personne', () => {
  for (const v of [undefined, '', '  ', ',,']) {
    const g = diagnostiquerGroupes(v);
    assert.equal(g.restreint, false, JSON.stringify(v));
    assert.equal(g.nombre, 0);
  }
});

test('groupes : les identifiants sont comptés, pas recopiés', () => {
  const g = diagnostiquerGroupes('aaaaaaaa-1111-2222-3333-444444444444, bbbbbbbb-5555-6666-7777-888888888888');
  assert.equal(g.nombre, 2);
  assert.equal(g.restreint, true);
  assert.deepEqual(g.apercus, ['aaaaaaaa… (36 car.)', 'bbbbbbbb… (36 car.)']);
});

// --- Le verdict d'ensemble ------------------------------------------------

test('verdict : les deux vides, c’est une alerte', () => {
  const d = diagnostiquerEntra({ ...ACTIF });
  assert.equal(d.niveau, 'alerte');
  assert.match(d.resume, /AUCUNE barrière/);
});

test('verdict : le tenant seul suffit à fermer', () => {
  const d = diagnostiquerEntra({ ...ACTIF, MICROSOFT_TENANT_ID: TENANT });
  assert.equal(d.niveau, 'ok');
});

test('verdict : les groupes seuls ne ferment qu’à moitié', () => {
  // Un compte d'une autre organisation, membre d'un groupe autorisé, entrerait.
  const d = diagnostiquerEntra({ ...ACTIF, MICROSOFT_ALLOWED_GROUPS: 'g1' });
  assert.equal(d.niveau, 'attention');
});

test('verdict : les deux ensemble, double barrière', () => {
  const d = diagnostiquerEntra({
    ...ACTIF, MICROSOFT_TENANT_ID: TENANT, MICROSOFT_ALLOWED_GROUPS: 'g1,g2',
  });
  assert.equal(d.niveau, 'ok');
  assert.match(d.resume, /double barrière/);
});

test('verdict : sans application Azure, il n’y a rien à juger', () => {
  // Sans CLIENT_ID/SECRET, api/_auth.js n'installe pas le fournisseur : un
  // « ALERTE » serait un faux positif, personne ne peut entrer par là.
  const d = diagnostiquerEntra({});
  assert.equal(d.niveau, 'inactif');
  assert.equal(d.configure, false);
});
