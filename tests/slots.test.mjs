// Phase 2 : créneaux réellement disponibles (availableSlotsFor).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/store.js';
import { availableSlotsFor } from '../js/engine.js';

function fixture() {
  const state = defaultState();
  state.team = [
    { id: 'p1', name: 'MEDAN Dominique', quals: { 'HAB-ELEC': { F: true, T: true }, 'R489-3': { F: true, T: true }, AIPR: { F: false, T: true } } },
    { id: 'p2', name: 'GARCIA Thierry', quals: { 'HAB-ELEC': { F: true, T: true }, 'R489-3': { F: true, T: true }, AIPR: { F: false, T: true } } },
  ];
  state.openDays = ['2026-09-01'];
  return state;
}

test('créneaux : journée vide → tous les débuts possibles pour 2h (08:00 → 15:00)', () => {
  const state = fixture();
  const avail = availableSlotsFor(state, { formation: 'HAB-ELEC', type: 'Initial', date: '2026-09-01', role: 'pratique' });
  assert.equal(avail[0], 480);
  assert.equal(avail.at(-1), 900, 'dernier départ : 15:00 pour finir à 17:00');
  assert.equal(avail.length, (900 - 480) / 30 + 1);
});

test('créneaux : un seul formateur restant → ses occupations ferment les créneaux', () => {
  const state = fixture();
  state.dayPresence = { '2026-09-01': ['p1'] }; // GARCIA absent
  state.inscriptions = [
    { id: 1, stagiaire: 'UN', formation: 'HAB-ELEC', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1', statut: 'confirmee' },
  ];
  const avail = availableSlotsFor(state, { formation: 'HAB-ELEC', type: 'Initial', date: '2026-09-01', role: 'pratique' });
  // p1 occupé 08:00-10:00 : plus aucun début avant 10:00
  assert.equal(avail[0], 600);
  assert.ok(!avail.includes(480) && !avail.includes(570));
});

test('créneaux : personne d’habilité présent → aucune proposition', () => {
  const state = fixture();
  state.dayPresence = { '2026-09-01': ['p2'] };
  state.team[1].quals['HAB-ELEC'].F = false;
  const avail = availableSlotsFor(state, { formation: 'HAB-ELEC', type: 'Initial', date: '2026-09-01', role: 'pratique' });
  assert.deepEqual(avail, []);
});

test('créneaux : capacité 2 (R489 Cat 3) — le créneau du formateur reste proposé', () => {
  const state = fixture();
  state.dayPresence = { '2026-09-01': ['p1'] };
  state.inscriptions = [
    { id: 1, stagiaire: 'UN', formation: 'R489-3', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1', statut: 'confirmee' },
  ];
  const avail = availableSlotsFor(state, { formation: 'R489-3', type: 'Initial', date: '2026-09-01', role: 'pratique' });
  assert.ok(avail.includes(480), '2e candidat possible sur le même créneau (2 chariots)');
});

test('créneaux : rôle test — l’épreuve AIPR (surveillance) ne bloque pas le testeur', () => {
  const state = fixture();
  state.inscriptions = [
    // À 10:00 : p1 surveille une épreuve AIPR (2h), p2 tient un test (1h)
    { id: 1, stagiaire: 'UN', formation: 'AIPR', type: 'Initial', datePratique: '2026-09-01', debutPratique: 600, testeurId: 'p1', statut: 'confirmee' },
    { id: 2, stagiaire: 'DEUX', formation: 'R489-3', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1',
      dateTestPratique: '2026-09-01', debutTestPratique: 600, testeurId: 'p2', statut: 'confirmee' },
  ];
  const availTest = availableSlotsFor(state, { formation: 'R489-3', type: 'Initial', date: '2026-09-01', role: 'test' }, null);
  // 10:00 : p2 en test, mais p1 reste disponible — la surveillance AIPR ne l'occupe pas
  assert.ok(availTest.includes(600));
  // Épreuve AIPR : tous les débuts possibles pour 2h — la surveillance ne
  // dépend pas des autres occupations (habilité + présent suffit)
  const availAipr = availableSlotsFor(state, { formation: 'AIPR', type: 'Recyclage', date: '2026-09-01', role: 'pratique' });
  assert.equal(availAipr[0], 480);
  assert.equal(availAipr.at(-1), 900, 'départ max 15:00 pour 2h');
  assert.ok(availAipr.includes(600), '10:00 proposé malgré l’épreuve et le test en cours');
});
