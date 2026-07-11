// Occupation agrégée par portée (carte KPI) : période / semaine / mois.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/store.js';
import { computeSchedule, occupationSummary } from '../js/engine.js';

// État minimal : 2 jours ouverts en septembre (S36 et S37) + 1 en octobre.
// 18 créneaux de 30 min par jour (08:00 → 17:00).
function fixture() {
  const state = defaultState();
  state.team = [{ id: 'p1', name: 'TEST Formateur', quals: { 'HAB-ELEC': { F: true, T: true } } }];
  state.openDays = ['2026-09-01', '2026-09-08', '2026-10-05'];
  state.inscriptions = [
    // 2h de pratique le 01/09 (S36) : 4 créneaux
    { id: 1, stagiaire: 'UN', formation: 'HAB-ELEC', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1', statut: 'confirmee' },
    // 2h le 08/09 (S37)
    { id: 2, stagiaire: 'DEUX', formation: 'HAB-ELEC', type: 'Initial', datePratique: '2026-09-08', debutPratique: 480, formateurId: 'p1', statut: 'confirmee' },
    // 2h le 05/10 (octobre)
    { id: 3, stagiaire: 'TROIS', formation: 'HAB-ELEC', type: 'Initial', datePratique: '2026-10-05', debutPratique: 480, formateurId: 'p1', statut: 'confirmee' },
  ];
  return state;
}

test('occupation : période complète', () => {
  const state = fixture();
  const occ = occupationSummary(state, computeSchedule(state), 'periode', '2026-09-01');
  assert.equal(occ.days, 3);
  assert.equal(occ.hours, 6);
  assert.equal(occ.pct, Math.round((12 / (3 * 18)) * 100)); // 22 %
});

test('occupation : semaine en cours (S36 ne compte que le 01/09)', () => {
  const state = fixture();
  const occ = occupationSummary(state, computeSchedule(state), 'semaine', '2026-09-03');
  assert.equal(occ.days, 1);
  assert.equal(occ.hours, 2);
  assert.equal(occ.pct, Math.round((4 / 18) * 100)); // 22 %
});

test('occupation : mois en cours (septembre = 2 jours, 4 h)', () => {
  const state = fixture();
  const occ = occupationSummary(state, computeSchedule(state), 'mois', '2026-09-15');
  assert.equal(occ.days, 2);
  assert.equal(occ.hours, 4);
  assert.equal(occ.pct, Math.round((8 / 36) * 100)); // 22 %
});

test('occupation : date hors période ramenée au début (semaine S36)', () => {
  const state = fixture();
  // « Aujourd'hui » avant la période → référence = 01/09 → semaine S36
  const occ = occupationSummary(state, computeSchedule(state), 'semaine', '2026-07-11');
  assert.equal(occ.ref, '2026-09-01');
  assert.equal(occ.days, 1);
  assert.equal(occ.hours, 2);
});

test('occupation : ligne annulée libère la portée', () => {
  const state = fixture();
  state.inscriptions[0].statut = 'annulee';
  const occ = occupationSummary(state, computeSchedule(state), 'semaine', '2026-09-01');
  assert.equal(occ.hours, 0);
  assert.equal(occ.pct, 0);
});

test('occupation : portée sans jour ouvert → 0 % sans division par zéro', () => {
  const state = fixture();
  const occ = occupationSummary(state, computeSchedule(state), 'mois', '2026-12-15');
  assert.equal(occ.days, 0);
  assert.equal(occ.pct, 0);
});
