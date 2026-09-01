// Pause déjeuner : désactivée par défaut, bloquante une fois active — sauf
// pour la théorie présentielle, seule séance qui ne tient pas dans une
// demi-journée et qui l'enjambe donc.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/store.js';
import { pauseCreneau, chevauchePause } from '../js/config.js';
import { availableSlotsFor, computeSchedule, minutesOffertes, occupationSummary } from '../js/engine.js';

function fixture({ pause = false } = {}) {
  const state = defaultState();
  state.team = [
    { id: 'p1', name: 'MEDAN Dominique', quals: { 'HAB-ELEC': { F: true, T: true }, 'R489-3': { F: true, T: true } } },
    { id: 'p2', name: 'GARCIA Thierry', quals: { 'HAB-ELEC': { F: true, T: true }, 'R489-3': { F: true, T: true } } },
  ];
  state.openDays = ['2026-09-01'];
  state.inscriptions = [];
  if (pause) state.params.pauseActive = true;
  return state;
}

const inscription = (over = {}) => ({
  id: 1, stagiaire: 'DURAND Thomas', formation: 'HAB-ELEC', type: 'Initial',
  statut: 'confirmee', modeTheorie: 'distance',
  datePratique: '2026-09-01', debutPratique: 480,
  ...over,
});

// --- Le paramètre lui-même ---

test('pause : inactive par défaut', () => {
  const state = defaultState();
  assert.equal(state.params.pauseActive, false);
  assert.equal(pauseCreneau(state.params), null);
  assert.equal(chevauchePause(state.params, 720, 780), false, 'inactive → rien ne la chevauche');
});

test('pause : bornes 12:00–13:00 une fois active', () => {
  const p = { pauseActive: true, pauseDebut: 720, pauseFin: 780 };
  assert.deepEqual(pauseCreneau(p), { debut: 720, fin: 780 });
  assert.equal(chevauchePause(p, 690, 750), true, '11:30–12:30 mord dessus');
  assert.equal(chevauchePause(p, 660, 720), false, '11:00–12:00 s’arrête pile au début');
  assert.equal(chevauchePause(p, 780, 840), false, '13:00–14:00 démarre pile à la fin');
  assert.equal(chevauchePause(p, 600, 900), true, '10:00–15:00 l’enjambe');
});

test('pause : bornes incohérentes (fin ≤ début) → ignorée', () => {
  assert.equal(pauseCreneau({ pauseActive: true, pauseDebut: 780, pauseFin: 780 }), null);
  assert.equal(pauseCreneau({ pauseActive: true, pauseDebut: 800, pauseFin: 780 }), null);
});

// --- Créneaux proposés ---

test('créneaux : la pause active retire les départs qui la chevauchent', () => {
  const avant = availableSlotsFor(fixture(), { formation: 'HAB-ELEC', type: 'Initial', date: '2026-09-01', role: 'pratique' });
  const apres = availableSlotsFor(fixture({ pause: true }), { formation: 'HAB-ELEC', type: 'Initial', date: '2026-09-01', role: 'pratique' });
  assert.ok(apres.length < avant.length, 'des créneaux disparaissent');
  // HAB-ELEC dure 2h : tout départ de 10:30 à 12:30 mord sur 12:00–13:00
  for (const t of apres) assert.equal(chevauchePause({ pauseActive: true, pauseDebut: 720, pauseFin: 780 }, t, t + 120), false);
  assert.ok(apres.includes(600), '10:00 → 12:00 tient encore avant la pause');
  assert.ok(apres.includes(780), '13:00 → 15:00 tient après');
  assert.ok(!apres.includes(660), '11:00 → 13:00 déborderait');
});

test('créneaux : la théorie présentielle enjambe la pause', () => {
  const state = fixture({ pause: true });
  const slots = availableSlotsFor(state, { formation: 'R489-3', type: 'Initial', date: '2026-09-01', role: 'theorie' });
  // 7h00 dans une journée de 9h00 : deux départs possibles, 08:00 et 09:00,
  // qui traversent tous deux 12:00–13:00.
  assert.ok(slots.length > 0, 'la théorie reste proposable');
  assert.ok(slots.every((t) => chevauchePause(state.params, t, t + 420)), 'toutes enjambent la pause');
});

// --- Anomalies ---

test('anomalie : une pratique qui mord sur la pause est signalée', () => {
  const state = fixture({ pause: true });
  state.inscriptions = [inscription({ debutPratique: 660 })]; // 11:00 → 13:00
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => /pause déjeuner/.test(e)), rows[0].errors.join(' | '));
});

test('anomalie : aucune tant que la pause est inactive', () => {
  const state = fixture();
  state.inscriptions = [inscription({ debutPratique: 660 })];
  const { rows } = computeSchedule(state);
  assert.equal(rows[0].errors.some((e) => /pause déjeuner/.test(e)), false, rows[0].errors.join(' | '));
});

test('anomalie : une pratique posée avant la pause reste saine', () => {
  const state = fixture({ pause: true });
  state.inscriptions = [inscription({ debutPratique: 600 })]; // 10:00 → 12:00
  const { rows } = computeSchedule(state);
  assert.equal(rows[0].errors.some((e) => /pause déjeuner/.test(e)), false, rows[0].errors.join(' | '));
});

test('anomalie : la théorie présentielle n’est jamais signalée pour la pause', () => {
  const state = fixture({ pause: true });
  state.inscriptions = [inscription({
    formation: 'R489-3', modeTheorie: 'presentiel',
    dateTheorieFormation: '2026-09-01', debutTheorieFormation: 480, // 08:00 → 15:00
  })];
  const { rows } = computeSchedule(state);
  assert.equal(rows[0].errors.some((e) => /pause déjeuner/.test(e)), false, rows[0].errors.join(' | '));
});

test('anomalie : la théorie EN CENTRE, elle, respecte la pause', () => {
  const state = fixture({ pause: true });
  state.inscriptions = [inscription({
    modeTheorie: 'centre',
    dateTheorieFormation: '2026-09-01', debutTheorieFormation: 660, // 11:00 → 14:30
  })];
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => /pause déjeuner/.test(e)), rows[0].errors.join(' | '));
});

// --- Occupation ---

test('occupation : la pause sort du dénominateur', () => {
  const sans = defaultState().params;
  assert.equal(minutesOffertes(sans), 540, '08:00–17:00 = 9h00');
  assert.equal(minutesOffertes({ ...sans, pauseActive: true }), 480, 'moins 1h00 de pause');
});

test('occupation : le taux monte quand la pause réduit les créneaux offerts', () => {
  const build = (pause) => {
    const state = fixture({ pause });
    state.inscriptions = [inscription({ debutPratique: 480 })]; // 08:00 → 10:00
    return occupationSummary(state, computeSchedule(state), 'periode');
  };
  const sans = build(false);
  const avec = build(true);
  assert.ok(avec.pct > sans.pct, `${avec.pct} % devrait dépasser ${sans.pct} %`);
  assert.equal(avec.hours, sans.hours, 'les heures réservées ne changent pas, seul le dénominateur bouge');
});
