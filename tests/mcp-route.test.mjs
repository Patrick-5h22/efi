// Route MCP de bout en bout : api/mcp.js exercé par de vraies requêtes HTTP.
//
// Supabase est remplacé en interceptant fetch, et l'authentification passe par
// de faux jetons — la route reste donc testable sans réseau ni secret, dans
// npm test. C'est le seul endroit où l'authentification, la comparaison de
// jetons et la garde d'écriture sont vérifiées.

import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { defaultState } from '../js/store.js';
import { addDays, dayOfWeek, dateDuJour } from '../js/dates.js';

// Cette suite passe par la route HTTP : elle n'injecte pas « aujourd'hui »,
// c'est l'horloge réelle qui décide. Les jours ouverts sont donc calculés à
// partir d'aujourd'hui — datés en dur, ils seraient tombés dans le passé et
// la règle « une disponibilité est à venir » aurait fait échouer la suite du
// jour au lendemain.
const AUJ = dateDuJour();
function joursOuvres(depuis, combien) {
  const out = [];
  let d = depuis;
  while (out.length < combien) {
    if (dayOfWeek(d) <= 5) out.push(d);
    d = addDays(d, 1);
  }
  return out;
}
const J = joursOuvres(AUJ, 4);          // J[0] = aujourd'hui ou le prochain jour ouvré
const PASSE = addDays(AUJ, -14);
const LOINTAIN = addDays(J[3], 30);

const JETON = 'jeton-de-test-valide';
const AUTRE = 'second-jeton-de-test';

const QUALS = { 'R489-3': { F: true, T: true }, 'R489-5': { F: true, T: true } };

let base;          // état partagé simulé
let lectures;      // nombre de lectures reçues
let sauvegardes;   // nombre d'écritures reçues
let refuserEcriture = false;
let avantChaqueLecture = null; // simule un autre poste qui enregistre
let serveur;
let url;
let vraiFetch;

let tic = 0;
const horodatage = () => new Date(Date.UTC(2026, 8, 11, 10, 0, 0) + (tic += 1000)).toISOString();

function etatInitial() {
  const s = defaultState();
  s.team = [
    { id: 'p1', name: 'MEDAN Dominique', quals: structuredClone(QUALS) },
    { id: 'p2', name: 'GARCIA Thierry', quals: structuredClone(QUALS) },
  ];
  s.openDays = [...J];
  s.inscriptions = [];
  return s;
}

before(async () => {
  process.env.EFI_ACCESS_CODE = 'code-de-test';
  process.env.MCP_TOKENS = `Jean Dupont=${JETON},Marie Martin=${AUTRE}`;

  // Les RPC Supabase sont simulés au niveau de fetch : api/_planning.js n'est
  // pas modifié pour les tests, c'est bien le vrai chemin qui est exercé.
  vraiFetch = globalThis.fetch;
  globalThis.fetch = async (cible, opts) => {
    const u = String(cible);
    if (u.includes('/rpc/efi_load_state')) {
      const body = JSON.parse(opts.body);
      if (body.p_code !== 'code-de-test') {
        return new Response('{"message":"code refusé"}', { status: 403 });
      }
      lectures += 1;
      avantChaqueLecture?.(lectures);
      // « savedAt » est REGÉNÉRÉ À CHAQUE LECTURE, comme le fait la vraie RPC.
      // Ce simulacre le supposait stable, et c'est précisément pour cela que
      // les tests laissaient passer une garde d'écriture qui refusait toute
      // pré-réservation en production.
      return Response.json({ ...base, savedAt: horodatage() });
    }
    if (u.includes('/rpc/efi_save_state')) {
      if (refuserEcriture) return new Response('{"message":"refus"}', { status: 500 });
      sauvegardes += 1;
      base = JSON.parse(opts.body).p_state;
      return Response.json({ savedAt: horodatage() });
    }
    return vraiFetch(cible, opts);
  };

  const { default: handler } = await import('../api/mcp.js');

  // Imite l'invocation Vercel : req.body déjà analysé, res.status().json()
  serveur = createServer((req, res) => {
    let brut = '';
    req.on('data', (c) => { brut += c; });
    req.on('end', () => {
      try { req.body = brut ? JSON.parse(brut) : undefined; } catch { req.body = undefined; }
      res.status = (c) => { res.statusCode = c; return res; };
      res.json = (o) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify(o));
        return res;
      };
      handler(req, res).catch((e) => { res.statusCode = 500; res.end(String(e)); });
    });
  });
  await new Promise((r) => { serveur.listen(0, r); });
  url = `http://127.0.0.1:${serveur.address().port}/api/mcp`;
});

after(async () => {
  globalThis.fetch = vraiFetch;
  await new Promise((r) => { serveur.close(r); });
  delete process.env.MCP_TOKENS;
  delete process.env.EFI_ACCESS_CODE;
});

beforeEach(() => {
  base = etatInitial();
  lectures = 0;
  sauvegardes = 0;
  refuserEcriture = false;
  avantChaqueLecture = null;
  process.env.MCP_TOKENS = `Jean Dupont=${JETON},Marie Martin=${AUTRE}`;
});

async function rpc(corps, jeton = JETON) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(jeton ? { authorization: `Bearer ${jeton}` } : {}),
    },
    body: JSON.stringify(corps),
  });
  let json = null;
  try { json = await res.json(); } catch { /* 202 sans corps */ }
  return { status: res.status, json, headers: res.headers };
}

const texteOutil = (r) => r.json?.result?.content?.[0]?.text || '';

// --- Authentification -------------------------------------------------------

test('route : sans jeton, 401 et en-tête WWW-Authenticate', async () => {
  const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, null);
  assert.equal(r.status, 401);
  assert.match(r.headers.get('www-authenticate') || '', /Bearer/);
});

test('route : jeton invalide refusé, sans divulguer le jeton attendu', async () => {
  const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, 'mauvais-jeton');
  assert.equal(r.status, 401);
  assert.ok(!JSON.stringify(r.json).includes(JETON), 'la réponse ne doit citer aucun jeton');
});

test('route : les deux jetons déclarés sont acceptés', async () => {
  for (const j of [JETON, AUTRE]) {
    const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, j);
    assert.equal(r.status, 200, `jeton ${j.slice(0, 6)}… refusé`);
  }
});

// docs/MCP.md recommande « openssl rand -base64 32 », dont la sortie se
// termine par « = » de remplissage et peut contenir « + » et « / ». Or
// MCP_TOKENS sépare le nom du jeton sur un « = » : découper sur TOUS les « = »
// au lieu du premier tronquerait le jeton déclaré à son remplissage, et la
// route accepterait alors une version raccourcie. Ce test épingle le contrat.
test('route : un jeton base64 est reconnu entier, remplissage compris', async () => {
  const base64 = 'aG5Ke3+dPq/R4tZmXcV1wLsN8yUb2EfGhIjKlMnOpQr=';
  process.env.MCP_TOKENS = `Commercial Base64=${base64}`;

  const bon = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, base64);
  assert.equal(bon.status, 200, 'le jeton complet doit être accepté');

  // Le même jeton amputé de son remplissage ne doit PAS passer : c'est le
  // signe qu'on compare bien la valeur entière.
  const tronque = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, base64.replace(/=+$/, ''));
  assert.equal(tronque.status, 401, 'un jeton tronqué au remplissage doit être refusé');

  // Et la partie avant le premier « = » — ici le nom — n'ouvre évidemment rien.
  const nom = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, 'Commercial Base64');
  assert.equal(nom.status, 401);
});

// --- Cohabitation OAuth / jetons statiques ----------------------------------
//
// Le flux OAuth complet — connexion, enregistrement dynamique, autorisation,
// échange de code, vérification du jeton — a été éprouvé contre un vrai
// PostgreSQL, et rend bien « NEAU Emmanuel » plutôt qu'une étiquette de jeton.
// Il ne peut pas tourner ici : la CI n'a pas de base d'authentification. Ce
// qui est épinglé ci-dessous, c'est ce qui DOIT rester vrai sans base — que
// l'arrivée de l'OAuth n'a rien cassé, et que le défi mène quelque part.

test('route : MCP_OAUTH actif, les jetons statiques fonctionnent toujours', async () => {
  process.env.MCP_OAUTH = '1';
  try {
    const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, JETON);
    assert.equal(r.status, 200, 'la bascule ne doit pas couper ce qui tourne en production');
  } finally {
    delete process.env.MCP_OAUTH;
  }
});

test('route : MCP_OAUTH actif, sans jeton le défi mène aux métadonnées', async () => {
  process.env.MCP_OAUTH = '1';
  try {
    const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, null);
    assert.equal(r.status, 401);
    const defi = r.headers.get('www-authenticate') || '';
    // RFC 9728 : c'est resource_metadata qui dit au client où commencer.
    // Sans lui, Claude abandonne l'autorisation sans message exploitable.
    assert.match(defi, /resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource\/api\/mcp"/,
      `le défi doit pointer vers les métadonnées de ressource, reçu : ${defi}`);
  } finally {
    delete process.env.MCP_OAUTH;
  }
});

// Le cas que mon test précédent manquait, et que seule la production a
// montré : SANS MCP_TOKENS, c'est-à-dire en OAuth seul — la configuration
// cible une fois la bascule finie — identifierCommercial lève un 503, pas un
// 401. Le défi était pose sur le statut de l'erreur au lieu du statut final,
// donc il n'était jamais envoyé dans le seul cas qui compte. Le connecteur
// recevait un 401 nu et abandonnait sans savoir qu'un flux existait.
test('route : OAuth seul, sans MCP_TOKENS, le défi est quand même posé', async () => {
  process.env.MCP_OAUTH = '1';
  delete process.env.MCP_TOKENS;
  try {
    for (const jeton of [null, 'jeton-invente']) {
      const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, jeton);
      assert.equal(r.status, 401, 'la route attend une autorisation, elle n’est pas fermée');
      assert.match(
        r.headers.get('www-authenticate') || '',
        /resource_metadata="[^"]+\/\.well-known\/oauth-protected-resource\/api\/mcp"/,
        `défi manquant ou incomplet pour jeton=${jeton}`,
      );
    }
  } finally {
    delete process.env.MCP_OAUTH;
  }
});

test('route : MCP_OAUTH actif, un jeton non déclaré n’ouvre rien', async () => {
  process.env.MCP_OAUTH = '1';
  try {
    const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' }, 'jeton-invente');
    assert.equal(r.status, 401);
    assert.ok(!JSON.stringify(r.json).includes(JETON), 'aucun jeton déclaré ne doit fuir');
  } finally {
    delete process.env.MCP_OAUTH;
  }
});

test('mcp-oauth : un jeton statique ne déclenche aucune vérification OAuth', async () => {
  process.env.MCP_OAUTH = '1';
  try {
    const { identifierParOAuth } = await import('../api/_mcp-oauth.js');
    // Un jeton OAuth est un JWT — trois segments. Un jeton de MCP_TOKENS,
    // tiré au hasard, n'en a aucun. Sans ce filtre, chaque requête d'un
    // commercial resté en jeton statique paierait un appel JWKS pour rien.
    const t0 = Date.now();
    const r = await identifierParOAuth({ headers: { authorization: `Bearer ${JETON}` } });
    assert.equal(r, null);
    assert.ok(Date.now() - t0 < 100, 'aucun accès réseau ne doit être tenté');
  } finally {
    delete process.env.MCP_OAUTH;
  }
});

test('route : sans MCP_TOKENS, la route est fermée (503) et non ouverte', async () => {
  delete process.env.MCP_TOKENS;
  const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'ping' });
  assert.equal(r.status, 503);
  assert.match(r.json.message, /non configuré/);
});

// --- Protocole --------------------------------------------------------------

test('route : initialize reprend une version de protocole connue', async () => {
  const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } });
  assert.equal(r.json.result.protocolVersion, '2025-06-18');
  assert.ok(r.json.result.capabilities.tools);
  assert.equal(r.json.result.serverInfo.name, 'efi-planning');
});

test('route : version inconnue → celle du serveur, pas celle demandée', async () => {
  const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '1999-01-01' } });
  assert.notEqual(r.json.result.protocolVersion, '1999-01-01');
  assert.match(r.json.result.protocolVersion, /^\d{4}-\d{2}-\d{2}$/);
});

test('route : une notification ne reçoit pas de réponse', async () => {
  const r = await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(r.status, 202);
});

test('route : méthode inconnue → -32601', async () => {
  const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'methode/inexistante' });
  assert.equal(r.json.error.code, -32601);
});

test('route : lot JSON-RPC traité en série', async () => {
  const r = await rpc([
    { jsonrpc: '2.0', id: 1, method: 'ping' },
    { jsonrpc: '2.0', id: 2, method: 'ping' },
  ]);
  assert.ok(Array.isArray(r.json));
  assert.equal(r.json.length, 2);
});

test('route : GET refusé avec Allow, OPTIONS ouvert pour CORS', async () => {
  const get = await fetch(url, { headers: { authorization: `Bearer ${JETON}` } });
  assert.equal(get.status, 405);
  assert.match(get.headers.get('allow') || '', /POST/);

  const opt = await fetch(url, { method: 'OPTIONS' });
  assert.equal(opt.status, 204);
  assert.equal(opt.headers.get('access-control-allow-origin'), '*');
});

// --- Outils -----------------------------------------------------------------

test('route : tools/list expose les deux outils, alimentés par le catalogue', async () => {
  const r = await rpc({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const outils = r.json.result.tools;
  assert.deepEqual(outils.map((t) => t.name), ['chercher_creneaux', 'pre_reserver']);
  assert.ok(outils[0].inputSchema.properties.formations.items.enum.includes('R489-3'));
});

test('route : une recherche rend un déroulé lisible sans rien écrire', async () => {
  const r = await rpc({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'chercher_creneaux', arguments: { formations: ['R489-3', 'R489-5'], a_partir_du: J[0], nb_options: 1 } },
  });
  const t = texteOutil(r);
  assert.match(t, /Possibilités pour/);
  assert.equal((t.match(/Test théorique/g) || []).length, 1, 'théorie mutualisée');
  assert.equal((t.match(/Formation pratique/g) || []).length, 2);
  assert.match(t, /Rien n’est réservé/);
  assert.equal(sauvegardes, 0, 'chercher_creneaux ne doit jamais écrire');
});

test('route : une erreur métier revient en isError, pas en panne', async () => {
  const r = await rpc({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'chercher_creneaux', arguments: { formations: ['R489-INEXISTANT'] } },
  });
  assert.equal(r.status, 200);
  assert.equal(r.json.result.isError, true);
  assert.match(texteOutil(r), /R489-INEXISTANT/);
});

test('route : outil inconnu → -32601', async () => {
  const r = await rpc({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'outil_inexistant', arguments: {} },
  });
  assert.equal(r.json.error.code, -32601);
});

test('route : une pré-réservation écrit des lignes traçables', async () => {
  const r = await rpc({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: {
      name: 'pre_reserver',
      arguments: { stagiaire: 'DURAND Thomas', formations: ['R489-3', 'R489-5'], jour: J[0], entreprise: 'BTP Charente' },
    },
  });
  assert.ok(!r.json.result.isError, texteOutil(r));
  assert.match(texteOutil(r), /Pré-réservation posée/);
  assert.equal(sauvegardes, 1);
  assert.equal(base.inscriptions.length, 2);
  for (const i of base.inscriptions) {
    assert.equal(i.statut, 'pre');
    assert.equal(i.reservePar, 'Jean Dupont');
    assert.ok(i.reserveLe);
  }
});

test('route : la présence par jour survit à l’écriture du MCP', async () => {
  base.dayPresence = { [J[0]]: ['p1', 'p2'] };
  await rpc({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'pre_reserver', arguments: { stagiaire: 'DURAND Thomas', formations: ['R489-3'], jour: J[0] } },
  });
  assert.deepEqual(base.dayPresence, { [J[0]]: ['p1', 'p2'] },
    'le MCP ne doit pas perdre la présence en réécrivant l’état');
});

test('route : un jour indisponible est refusé, pas décalé', async () => {
  const r = await rpc({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'pre_reserver', arguments: { stagiaire: 'DURAND Thomas', formations: ['R489-3'], jour: LOINTAIN } },
  });
  assert.equal(r.json.result.isError, true);
  assert.equal(sauvegardes, 0, 'rien ne doit être écrit sur un refus');
});

// Une disponibilité est toujours à venir — vérifié ici de bout en bout, avec
// l'horloge réelle : c'est « aujourd'hui » du serveur qui doit faire le
// plancher, pas une date injectée par le test.
test('route : le passé n’est ni proposé ni pré-réservable', async () => {
  base.openDays = [PASSE, ...J];

  const cherche = await rpc({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'chercher_creneaux', arguments: { formations: ['R489-3'], nb_options: 3 } },
  });
  const texte = texteOutil(cherche);
  assert.ok(!texte.includes(PASSE.slice(8) + '/' + PASSE.slice(5, 7)),
    `journée écoulée proposée : ${texte}`);
  assert.match(texte, /à partir d’aujourd’hui/);

  const pose = await rpc({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'pre_reserver', arguments: { stagiaire: 'DURAND Thomas', formations: ['R489-3'], jour: PASSE } },
  });
  assert.equal(pose.json.result.isError, true);
  assert.match(texteOutil(pose), /déjà passé/);
  assert.equal(sauvegardes, 0, 'aucune écriture pour une date passée');
});

// --- Garde d'écriture -------------------------------------------------------
//
// La sauvegarde remplace l'état entier : deux écrivains s'écrasent. Ces trois
// tests décrivent le seul comportement acceptable — ne jamais refuser pour un
// horodatage qui bouge tout seul, ne jamais effacer le travail d'un autre.

const preReservation = (jour = J[0]) => ({
  jsonrpc: '2.0', id: 1, method: 'tools/call',
  params: { name: 'pre_reserver', arguments: { stagiaire: 'DURAND Thomas', formations: ['R489-3'], jour } },
});

test('route : un planning inchangé n’est jamais pris pour un conflit', async () => {
  // La base rend un « savedAt » neuf à chaque lecture. Comparer ces
  // horodatages refusait TOUTE pré-réservation ; seul le contenu compte.
  const r = await rpc(preReservation());
  assert.ok(!r.json.result?.isError, texteOutil(r));
  assert.doesNotMatch(texteOutil(r), /modifié entre-temps/);
  assert.equal(sauvegardes, 1);
});

test('route : une modification concurrente est préservée, pas écrasée', async () => {
  // Une assistante enregistre entre notre lecture et notre écriture.
  avantChaqueLecture = (n) => {
    if (n === 2) base.openDays = [...base.openDays, LOINTAIN];
  };

  const r = await rpc(preReservation());
  assert.ok(!r.json.result?.isError, texteOutil(r));
  assert.equal(sauvegardes, 1);
  assert.ok(base.openDays.includes(LOINTAIN),
    'recalculer sur l’état frais, sinon la modification de l’assistante disparaît');
  assert.ok(base.inscriptions.some((i) => i.stagiaire === 'DURAND Thomas' && i.statut === 'pre'),
    'la pré-réservation doit tout de même être posée');
});

test('route : un planning qui bouge sans arrêt fait refuser l’écriture', async () => {
  let n = 0;
  avantChaqueLecture = () => { base.openDays = [...base.openDays, addDays(LOINTAIN, n += 1)]; };

  const r = await rpc(preReservation());
  assert.equal(r.json.result.isError, true);
  assert.match(texteOutil(r), /modifié entre-temps/);
  assert.equal(sauvegardes, 0, 'rien ne doit être écrit sur un conflit');
});

test('route : une anomalie déjà présente n’empêche pas de pré-réserver ailleurs', async () => {
  // Ligne incomplète laissée par l'assistante : elle porte ses anomalies. Le
  // filet doit refuser d'en CRÉER, pas refuser tout un planning imparfait.
  base.inscriptions = [{
    id: 99, stagiaire: 'À COMPLÉTER', formation: 'R489-3', type: 'Initial',
    datePratique: J[3], debutPratique: 480, statut: 'confirmee',
  }];

  const r = await rpc(preReservation());
  assert.ok(!r.json.result?.isError, texteOutil(r));
  assert.equal(sauvegardes, 1);
  assert.ok(base.inscriptions.some((i) => i.id === 99), 'la ligne imparfaite reste intacte');
});

test('route : une panne d’écriture amont n’est pas silencieuse', async () => {
  refuserEcriture = true;
  const r = await rpc({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'pre_reserver', arguments: { stagiaire: 'DURAND Thomas', formations: ['R489-3'], jour: J[0] } },
  });
  assert.ok(r.json.error || r.json.result?.isError, 'un échec d’écriture doit remonter');
});
