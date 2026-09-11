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

const JETON = 'jeton-de-test-valide';
const AUTRE = 'second-jeton-de-test';

const QUALS = { 'R489-3': { F: true, T: true }, 'R489-5': { F: true, T: true } };

let base;          // état partagé simulé
let savedAt;
let sauvegardes;   // nombre d'écritures reçues
let refuserEcriture = false;
let serveur;
let url;
let vraiFetch;

function etatInitial() {
  const s = defaultState();
  s.team = [
    { id: 'p1', name: 'MEDAN Dominique', quals: structuredClone(QUALS) },
    { id: 'p2', name: 'GARCIA Thierry', quals: structuredClone(QUALS) },
  ];
  s.openDays = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'];
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
      return Response.json({ ...base, savedAt });
    }
    if (u.includes('/rpc/efi_save_state')) {
      if (refuserEcriture) return new Response('{"message":"refus"}', { status: 500 });
      sauvegardes += 1;
      base = JSON.parse(opts.body).p_state;
      savedAt = new Date(Date.now() + sauvegardes * 1000).toISOString();
      return Response.json({ savedAt });
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
  savedAt = '2026-09-11T10:00:00Z';
  sauvegardes = 0;
  refuserEcriture = false;
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
    params: { name: 'chercher_creneaux', arguments: { formations: ['R489-3', 'R489-5'], a_partir_du: '2026-09-15', nb_options: 1 } },
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
      arguments: { stagiaire: 'DURAND Thomas', formations: ['R489-3', 'R489-5'], jour: '2026-09-15', entreprise: 'BTP Charente' },
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
  base.dayPresence = { '2026-09-15': ['p1', 'p2'] };
  await rpc({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'pre_reserver', arguments: { stagiaire: 'DURAND Thomas', formations: ['R489-3'], jour: '2026-09-15' } },
  });
  assert.deepEqual(base.dayPresence, { '2026-09-15': ['p1', 'p2'] },
    'le MCP ne doit pas perdre la présence en réécrivant l’état');
});

test('route : un jour indisponible est refusé, pas décalé', async () => {
  const r = await rpc({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'pre_reserver', arguments: { stagiaire: 'DURAND Thomas', formations: ['R489-3'], jour: '2026-09-01' } },
  });
  assert.equal(r.json.result.isError, true);
  assert.equal(sauvegardes, 0, 'rien ne doit être écrit sur un refus');
});

test('route : une panne d’écriture amont n’est pas silencieuse', async () => {
  refuserEcriture = true;
  const r = await rpc({
    jsonrpc: '2.0', id: 1, method: 'tools/call',
    params: { name: 'pre_reserver', arguments: { stagiaire: 'DURAND Thomas', formations: ['R489-3'], jour: '2026-09-15' } },
  });
  assert.ok(r.json.error || r.json.result?.isError, 'un échec d’écriture doit remonter');
});
