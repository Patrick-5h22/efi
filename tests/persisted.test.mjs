// Champs transmis à la base partagée.
//
// Régression : « dayPresence » était modifié dans l'application mais jamais
// enregistré, parce que la liste des champs persistés était recopiée dans
// js/db.js et dans api/state.js et qu'aucune des deux ne le mentionnait.
// La présence des intervenants revenait donc à « tous présents » dès qu'un
// autre poste rechargeait le planning.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PERSISTED_FIELDS, pickPersisted } from '../js/persisted.js';
import { defaultState, migrate } from '../js/store.js';

test('persistance : la présence par jour fait partie des champs enregistrés', () => {
  assert.ok(PERSISTED_FIELDS.includes('dayPresence'),
    'dayPresence doit être persisté : le moteur s’en sert pour choisir les intervenants');
});

test('persistance : tout champ saisi de l’état par défaut est transmis', () => {
  // Ce qui figure dans defaultState() est saisi, donc doit survivre à un
  // aller-retour avec la base — hors deux marqueurs internes :
  //   nextId  : recalculé au chargement à partir des inscriptions ;
  //   version : marqueur de schéma, posé mais jamais relu à ce jour.
  const interne = new Set(['nextId', 'version']);
  const attendus = Object.keys(defaultState()).filter((k) => !interne.has(k));
  for (const champ of attendus) {
    assert.ok(PERSISTED_FIELDS.includes(champ), `champ « ${champ} » jamais enregistré`);
  }
});

test('persistance : pickPersisted retient les champs voulus et écarte les dérivés', () => {
  const state = defaultState();
  state.dayPresence = { '2026-09-01': ['p1'] };
  state.nextId = 42;
  state.schedule = { rows: [] }; // dérivé, ne doit jamais partir

  const payload = pickPersisted(state);
  assert.deepEqual(payload.dayPresence, { '2026-09-01': ['p1'] });
  assert.equal(payload.schedule, undefined, 'les dérivés ne sont pas transmis');
  assert.equal(payload.nextId, undefined, 'nextId est recalculé au chargement');
  assert.deepEqual(Object.keys(payload).sort(), [...PERSISTED_FIELDS].sort());
});

test('persistance : aller-retour complet, la présence survit', () => {
  const source = defaultState();
  source.dayPresence = { '2026-09-02': ['p1', 'p3'] };
  source.openDays = ['2026-09-02'];

  // Ce que la base renvoie = ce qui lui a été transmis
  const recharge = migrate(structuredClone(pickPersisted(source)));

  assert.deepEqual(recharge.dayPresence, { '2026-09-02': ['p1', 'p3'] },
    'la présence saisie doit revenir identique depuis la base');
});

test('persistance : un état ancien sans présence se recharge sans casser', () => {
  const ancien = pickPersisted(defaultState());
  delete ancien.dayPresence;
  const recharge = migrate(ancien);
  assert.deepEqual(recharge.dayPresence, {}, 'migrate() comble le champ absent');
});

test('persistance : les deux appelants passent par la liste commune', () => {
  // Garde-fou contre la réapparition d'une liste recopiée à la main.
  for (const fichier of ['js/db.js', 'api/state.js']) {
    const src = readFileSync(new URL(`../${fichier}`, import.meta.url), 'utf8');
    assert.ok(/pickPersisted/.test(src), `${fichier} doit utiliser pickPersisted()`);
    assert.ok(!/const \{ params, formations, team, openDays/.test(src),
      `${fichier} contient encore une liste de champs recopiée`);
  }
});
