import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, seedExamples } from '../js/store.js';
import { memberAvailability } from '../js/engine.js';

test('disponibilités : formateur occupé signalé, habilitation vérifiée', () => {
  const state = seedExamples(defaultState());
  state.team.push({ id: 'p3', name: 'AUTRE A', quals: {} });
  // Créneau chevauchant la pratique de DUPONT (garcia p2 occupé 08:00-09:30 le 01/09)
  const avail = memberAvailability(state, {
    formation: 'R489-1B', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 510,
    dateTestPratique: '2026-09-01', debutTestPratique: 570, // chevauche test de DUPONT (p1 testeur 09:30)
  });
  const p1 = avail.find((a) => a.id === 'p1');
  const p2 = avail.find((a) => a.id === 'p2');
  const p3 = avail.find((a) => a.id === 'p3');
  assert.equal(p2.F, 'occupe');      // garcia forme DUPONT 08:00-09:30
  assert.equal(p1.F, 'occupe');      // la pratique 08:30-10:00 chevauche le test que Medan fait passer à 09:30
  assert.equal(p3.F, 'non-habilite');
  assert.equal(p1.T, 'occupe');      // Medan teste DUPONT 09:30-10:30
  assert.equal(p2.T, 'libre');       // garcia est libre à 09:30 (fin de sa pratique)
});

test('disponibilités : capacité 2 en R489-3 laisse le formateur libre', () => {
  const state = seedExamples(defaultState());
  // 01/09 13:00-14:30 : garcia (p2) forme DUPONT + MARTIN en Cat 3 (2/2) → saturé
  const availCat3 = memberAvailability(state, {
    formation: 'R489-3', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 780,
  });
  assert.equal(availCat3.find((a) => a.id === 'p2').F, 'occupe'); // capacité atteinte (2)
});
