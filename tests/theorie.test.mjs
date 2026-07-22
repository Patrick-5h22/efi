// Phase 3 : modes de théorie — sessions présentielles inter mutualisées,
// e-learning en centre, capacité de salle.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/store.js';
import { computeSchedule, roomFreeSlots, availableSlotsFor } from '../js/engine.js';

function fixture() {
  const state = defaultState();
  state.team = [
    { id: 'p1', name: 'MEDAN Dominique', quals: { 'R489-1A': { F: true, T: true }, 'R489-3': { F: true, T: true } } },
    { id: 'p2', name: 'GARCIA Thierry', quals: { 'R489-1A': { F: true, T: true }, 'R489-3': { F: true, T: true } } },
  ];
  state.openDays = ['2026-09-01', '2026-09-02'];
  return state;
}

const presRow = (id, stagiaire, formation, type, extra = {}) => ({
  id, stagiaire, formation, type, statut: 'confirmee',
  modeTheorie: 'presentiel', dateTheorieFormation: '2026-09-01', debutTheorieFormation: 480,
  ...extra,
});

test('sessions inter : même reco + même créneau = une session, un formateur commun', () => {
  const state = fixture();
  state.inscriptions = [
    presRow(1, 'UN', 'R489-1A', 'Recyclage'),
    presRow(2, 'DEUX', 'R489-3', 'Recyclage'),
  ];
  const { rows, theorySessions } = computeSchedule(state);
  assert.equal(theorySessions.length, 1, 'une seule session mutualisée (même reco R489)');
  assert.equal(theorySessions[0].stagiaires.length, 2);
  assert.equal(theorySessions[0].fin, 480 + 210, 'recyclage : 3h30');
  assert.ok(rows[0].formateurTheorieEffectif, 'formateur affecté');
  assert.equal(rows[0].formateurTheorieEffectif, rows[1].formateurTheorieEffectif, 'formateur commun');
  // Aucune anomalie liée à la théorie (les erreurs restantes = pratique/tests
  // non planifiés dans cette fixture minimale, hors sujet ici)
  assert.ok(!rows[0].errors.some((e) => /héorie présentielle|Salle|mélang/.test(e)), rows[0].errors.join(' | '));
});

test('sessions inter : initiale = 7h00, et mélange initiale/recyclage signalé', () => {
  const state = fixture();
  state.inscriptions = [
    presRow(1, 'UN', 'R489-1A', 'Initial'),
    presRow(2, 'DEUX', 'R489-3', 'Recyclage'),
  ];
  const { rows, theorySessions } = computeSchedule(state);
  assert.equal(theorySessions[0].fin, 480 + 420, 'durée de la session = type de la 1re ligne (7h00)');
  assert.ok(rows[0].errors.some((e) => e.includes('mélangés')), rows[0].errors.join(' | '));
});

test('sessions inter : le formateur de session est occupé — pas de pratique en même temps', () => {
  const state = fixture();
  state.inscriptions = [
    presRow(1, 'UN', 'R489-1A', 'Recyclage', { formateurTheorieId: 'p1' }),
    // p1 en pratique 09:00-10:30 pendant sa session 08:00-11:30 → conflit
    { id: 2, stagiaire: 'TROIS', formation: 'R489-1A', type: 'Initial', datePratique: '2026-09-01', debutPratique: 540, formateurId: 'p1', statut: 'confirmee' },
  ];
  const { rows } = computeSchedule(state);
  assert.ok(rows[1].errors.some((e) => e.includes('théorie présentielle et en activité')), rows[1].errors.join(' | '));
});

test('e-learning en centre : créneau en salle sans mobiliser de formateur', () => {
  const state = fixture();
  state.inscriptions = [
    { id: 1, stagiaire: 'QUATRE', formation: 'R489-1A', type: 'Recyclage', statut: 'confirmee',
      modeTheorie: 'centre', dateTheorieFormation: '2026-09-01', debutTheorieFormation: 600 },
  ];
  const { rows, theorySessions } = computeSchedule(state);
  assert.equal(theorySessions.length, 0, 'pas de session présentielle');
  assert.equal(rows[0].formateurTheorieEffectif, null);
  assert.equal(rows[0].finTheorieFormation, 600 + 210, 'durée par défaut 3h30');
  // seule anomalie tolérée : date pratique manquante (théorie seule saisie)
  assert.ok(!rows[0].errors.some((e) => e.includes('Théorie en centre')), rows[0].errors.join(' | '));
});

test('capacité de salle : dépassement signalé (présentiel + centre cumulés)', () => {
  const state = fixture();
  state.params.salleCapacite = 2;
  state.inscriptions = [
    presRow(1, 'UN', 'R489-1A', 'Recyclage'),
    presRow(2, 'DEUX', 'R489-3', 'Recyclage'),
    { id: 3, stagiaire: 'TROIS', formation: 'R489-1A', type: 'Recyclage', statut: 'confirmee',
      modeTheorie: 'centre', dateTheorieFormation: '2026-09-01', debutTheorieFormation: 540 },
  ];
  const { rows } = computeSchedule(state);
  // 09:00-11:30 : UN + DEUX (session) + TROIS (centre) = 3 > 2
  assert.ok(rows[2].errors.some((e) => e.includes('Salle de théorie pleine')), rows[2].errors.join(' | '));
  assert.ok(rows[0].errors.some((e) => e.includes('Salle de théorie pleine')));
  // roomFreeSlots : plus de place pendant la session, place après
  const free = roomFreeSlots(state, { date: '2026-09-01', duration: 60 });
  assert.ok(!free.includes(540), '09:00 complet');
  assert.ok(free.includes(720), '12:00 disponible (session finie à 11:30)');
});

test('mode saisi mais date/heure manquantes → anomalies explicites', () => {
  const state = fixture();
  state.inscriptions = [
    { id: 1, stagiaire: 'CINQ', formation: 'R489-1A', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, statut: 'confirmee', modeTheorie: 'presentiel' },
  ];
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('Théorie présentielle : date manquante')), rows[0].errors.join(' | '));
});

test('créneaux guidés : rôle théorie (formateur libre) sur la bonne durée', () => {
  const state = fixture();
  // p1 et p2 pris en pratique 08:00-09:30 → une session 3h30 ne peut commencer qu'à 09:30 (fin 13:00)
  state.inscriptions = [
    { id: 1, stagiaire: 'A', formation: 'R489-1A', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1', statut: 'confirmee' },
    { id: 2, stagiaire: 'B', formation: 'R489-1A', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p2', statut: 'confirmee' },
  ];
  const avail = availableSlotsFor(state, { formation: 'R489-1A', type: 'Recyclage', date: '2026-09-01', role: 'theorie' });
  assert.ok(!avail.includes(480), '08:00 impossible (les 2 formateurs en pratique)');
  assert.ok(avail.includes(570), '09:30 possible');
  assert.ok(avail.at(-1) <= 1020 - 210, 'départ compatible avec 3h30');
});
