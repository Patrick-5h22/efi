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
import { PERSISTED_FIELDS, pickPersisted, empreintePersistee } from '../js/persisted.js';
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

// L'empreinte est ce qui permet de savoir si le planning a réellement changé
// avant d'écrire par-dessus. Elle doit ignorer tout ce qui n'est pas du
// contenu saisi — l'horodatage `savedAt` en premier lieu, que la base
// régénère à chaque lecture.
test('empreinte : insensible à l’ordre des clés et aux champs non persistés', () => {
  const a = defaultState();
  a.openDays = ['2026-09-02'];
  a.dayPresence = { '2026-09-02': ['p1', 'p3'] };

  const b = structuredClone(a);
  // Même contenu, clés dans un autre ordre (ce que rend un autre encodeur JSON)
  b.dayPresence = { '2026-09-02': [...a.dayPresence['2026-09-02']] };
  b.params = Object.fromEntries(Object.entries(a.params).reverse());
  // …plus tout ce que la base ajoute ou recalcule
  b.savedAt = new Date().toISOString();
  b.nextId = 999;
  b.schedule = { rows: [{ errors: [] }] };

  assert.equal(empreintePersistee(a), empreintePersistee(b),
    'même contenu saisi ⇒ même empreinte, sinon toute écriture semble en conflit');
});

test('empreinte : une modification du contenu, même minuscule, se voit', () => {
  const a = defaultState();
  const b = structuredClone(a);
  b.openDays = [...a.openDays, '2026-12-25'];
  assert.notEqual(empreintePersistee(a), empreintePersistee(b));

  const c = structuredClone(a);
  c.inscriptions = [{ id: 1, stagiaire: 'UN', formation: 'R489-3' }];
  assert.notEqual(empreintePersistee(a), empreintePersistee(c));
});

test('persistance : les deux appelants passent par la liste commune', () => {
  // Garde-fou contre la réapparition d'une liste recopiée à la main.
  // Les deux endroits qui construisent la charge utile : le navigateur, et le
  // module d'accès aux RPC côté serveur (dont api/state.js et api/mcp.js
  // dépendent tous les deux).
  for (const fichier of ['js/db.js', 'api/_planning.js']) {
    const src = readFileSync(new URL(`../${fichier}`, import.meta.url), 'utf8');
    assert.ok(/pickPersisted/.test(src), `${fichier} doit utiliser pickPersisted()`);
    assert.ok(!/const \{ params, formations, team, openDays/.test(src),
      `${fichier} contient encore une liste de champs recopiée`);
  }
});
