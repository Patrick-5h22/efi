// Phase 1 : formation AIPR « épreuve seule » + présence des intervenants par jour.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, migrate } from '../js/store.js';
import { computeSchedule, memberAvailability } from '../js/engine.js';

function fixture() {
  const state = defaultState();
  state.team = [
    { id: 'p1', name: 'MEDAN Dominique', quals: { AIPR: { F: false, T: true }, 'HAB-ELEC': { F: true, T: true } } },
    { id: 'p2', name: 'GARCIA Thierry', quals: { AIPR: { F: false, T: true }, 'HAB-ELEC': { F: true, T: true } } },
  ];
  state.openDays = ['2026-09-01', '2026-09-02'];
  return state;
}

test('migration : AIPR injectée dans un état existant, dayPresence initialisé', () => {
  const old = { version: 1, formations: [{ code: 'HAB-ELEC', label: 'Hab élec', reco: 'HAB ELEC', dureeInitial: 120, dureeRecyclage: 120, tests: false, capacite: 1 }], inscriptions: [] };
  const migrated = migrate(old);
  const aipr = migrated.formations.find((f) => f.code === 'AIPR');
  assert.ok(aipr, 'AIPR ajoutée au catalogue existant');
  assert.equal(aipr.testOnly, true);
  assert.equal(aipr.dureeInitial, 120);
  assert.deepEqual(migrated.dayPresence, {});
  assert.equal(migrated.params.salleCapacite, 12);
});

test('AIPR : l’épreuve est tenue par un testeur, pas de formateur ni de test requis', () => {
  const state = fixture();
  state.inscriptions = [{ id: 1, stagiaire: 'DURAND Paul', formation: 'AIPR', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, statut: 'confirmee' }];
  const { rows } = computeSchedule(state);
  const r = rows[0];
  assert.equal(r.errors.length, 0, r.errors.join(' | '));
  assert.equal(r.formateurEffectif, null, 'pas de formateur mobilisé');
  assert.ok(r.testeurEffectif, 'un testeur est affecté automatiquement');
  assert.equal(r.finPratique, 480 + 120, 'épreuve de 2h00');
});

test('AIPR : deux épreuves simultanées avec le même testeur explicite → anomalie', () => {
  const state = fixture();
  state.inscriptions = [
    { id: 1, stagiaire: 'UN', formation: 'AIPR', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, testeurId: 'p1', statut: 'confirmee' },
    { id: 2, stagiaire: 'DEUX', formation: 'AIPR', type: 'Recyclage', datePratique: '2026-09-01', debutPratique: 510, testeurId: 'p1', statut: 'confirmee' },
  ];
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('2 épreuves')), rows[0].errors.join(' | '));
  // En automatique, le moteur choisit l'autre testeur → pas d'anomalie
  delete state.inscriptions[1].testeurId;
  const again = computeSchedule(state).rows;
  assert.equal(again[1].errors.length, 0, again[1].errors.join(' | '));
  assert.equal(again[1].testeurEffectif, 'p2');
});

test('présence par jour : contrainte dure pour l’affectation automatique', () => {
  const state = fixture();
  state.dayPresence = { '2026-09-01': ['p2'] }; // seul GARCIA présent
  state.inscriptions = [{ id: 1, stagiaire: 'TROIS', formation: 'HAB-ELEC', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, statut: 'confirmee' }];
  const { rows } = computeSchedule(state);
  assert.equal(rows[0].formateurEffectif, 'p2', 'l’auto-affectation ignore les absents');
  assert.equal(rows[0].errors.length, 0);
});

test('présence par jour : intervenant choisi un jour où il est absent → anomalie', () => {
  const state = fixture();
  state.dayPresence = { '2026-09-01': ['p2'] };
  state.inscriptions = [{ id: 1, stagiaire: 'QUATRE', formation: 'HAB-ELEC', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1', statut: 'confirmee' }];
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('non présent ce jour')), rows[0].errors.join(' | '));
});

test('présence par jour : personne de présent habilité → « aucun disponible »', () => {
  const state = fixture();
  state.dayPresence = { '2026-09-01': ['p2'] };
  state.team[1].quals['HAB-ELEC'].F = false; // GARCIA présent mais non habilité
  state.inscriptions = [{ id: 1, stagiaire: 'CINQ', formation: 'HAB-ELEC', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, statut: 'confirmee' }];
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('Aucun formateur disponible')));
});

test('disponibilités : absent signalé, AIPR annonce la colonne T sur le créneau d’épreuve', () => {
  const state = fixture();
  state.dayPresence = { '2026-09-01': ['p2'] };
  const availAipr = memberAvailability(state, { formation: 'AIPR', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480 });
  const p1 = availAipr.find((a) => a.id === 'p1');
  const p2 = availAipr.find((a) => a.id === 'p2');
  assert.equal(p1.T, 'absent');
  assert.equal(p2.T, 'libre');
  assert.equal(p1.F, null, 'pas de rôle formateur pour une épreuve seule');
});
