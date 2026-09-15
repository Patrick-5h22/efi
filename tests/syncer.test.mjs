// Synchroniseur permanent (js/db.js) : détection des modifications venues
// d'un autre poste.
//
// Régression : la détection comparait l'horodatage « savedAt » rendu par
// efi_load_state. La base le régénère À CHAQUE LECTURE — chaque tour
// d'interrogation croyait donc voir une modification, rechargeait le planning
// et affichait « Planning mis à jour depuis la base partagée » toutes les
// 45 secondes, sur chaque poste connecté. Le même horodatage avait aussi
// rendu toute pré-réservation impossible côté MCP.
//
// js/db.js est écrit pour le navigateur : ce test lui fournit le strict
// minimum de globales, et rien d'autre.

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.window = { addEventListener() {} };
globalThis.document = { hidden: false, addEventListener() {} };
globalThis.localStorage = {
  valeurs: new Map(),
  getItem(k) { return this.valeurs.get(k) ?? null; },
  setItem(k, v) { this.valeurs.set(k, String(v)); },
  removeItem(k) { this.valeurs.delete(k); },
};

const { createSyncer, setAccessCode } = await import('../js/db.js');

let distant;      // contenu de la base simulée
let lectures;     // nombre de lectures reçues
let ecritures;
let signales;     // modifications signalées à l'application

function etat() {
  return {
    params: { debut: 480, fin: 1020 },
    formations: [],
    team: [{ id: 'p1', name: 'MEDAN Dominique' }],
    openDays: ['2026-09-15'],
    dayAssignments: {},
    dayPresence: { '2026-09-15': ['p1'] },
    inscriptions: [],
  };
}

// createSyncer arme un setInterval de reprise réseau : sans neutralisation, le
// processus de test ne rendrait jamais la main.
function synchroniseur() {
  const vrai = globalThis.setInterval;
  globalThis.setInterval = () => 0;
  try {
    return createSyncer({
      getState: () => distant,
      onStatus: () => {},
      onRemoteChange: (remote) => { signales.push(remote); return true; },
    });
  } finally {
    globalThis.setInterval = vrai;
  }
}

beforeEach(() => {
  setAccessCode(localStorage, 'code-de-test');
  distant = etat();
  lectures = 0;
  ecritures = 0;
  signales = [];

  globalThis.fetch = async (cible, opts) => {
    const u = String(cible);
    if (u.includes('efi_load_state')) {
      lectures += 1;
      // Horodatage NEUF à chaque lecture, comme la vraie RPC.
      return Response.json({ ...distant, savedAt: `2026-09-15T10:00:${String(lectures).padStart(2, '0')}Z` });
    }
    if (u.includes('efi_save_state')) {
      ecritures += 1;
      distant = JSON.parse(opts.body).p_state;
      return Response.json({ savedAt: `2026-09-15T11:00:${String(ecritures).padStart(2, '0')}Z` });
    }
    throw new Error(`appel inattendu : ${u}`);
  };
});

test('synchroniseur : un planning inchangé ne déclenche aucun rechargement', async () => {
  const s = synchroniseur();
  await s.poll(); // premier tour : mémorise ce qui est en base
  await s.poll();
  await s.poll();
  assert.equal(lectures, 3, 'les trois tours ont bien interrogé la base');
  assert.deepEqual(signales, [],
    'rien n’a changé : ne pas recharger ni prévenir l’utilisateur');
});

test('synchroniseur : une modification faite ailleurs est bien signalée', async () => {
  const s = synchroniseur();
  await s.poll();

  distant = { ...etat(), openDays: ['2026-09-15', '2026-09-16'] };
  await s.poll();
  assert.equal(signales.length, 1, 'un vrai changement doit remonter');
  assert.deepEqual(signales[0].openDays, ['2026-09-15', '2026-09-16']);

  await s.poll();
  assert.equal(signales.length, 1, 'signalé une seule fois, pas à chaque tour');
});

test('synchroniseur : le chargement initial n’est pas pris pour un changement', async () => {
  const s = synchroniseur();
  const initial = await (await fetch('https://x/rest/v1/rpc/efi_load_state')).json();
  s.seenRemote(initial);
  await s.poll();
  assert.deepEqual(signales, [], 'ce qui vient d’être affiché ne change pas');
});

test('synchroniseur : après notre propre sauvegarde, aucun faux changement', async () => {
  const s = synchroniseur();
  await s.poll();
  distant.openDays = ['2026-09-15', '2026-09-17']; // saisie locale
  await s.flush();
  assert.equal(ecritures, 1);
  await s.poll();
  assert.deepEqual(signales, [], 'notre propre écriture ne nous revient pas comme une modification');
});
