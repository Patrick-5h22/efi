import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, seedExamples, addInscription } from '../js/store.js';
import { computeSchedule } from '../js/engine.js';

function freshState() {
  const s = defaultState();
  return s;
}

test('les 4 exemples du classeur sont ✓ OK', () => {
  const state = seedExamples(freshState());
  const { rows } = computeSchedule(state);
  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.deepEqual(row.errors, [], `ligne ${row.insc.id} (${row.insc.stagiaire}) : ${row.errors}`);
  }
  // Durées et fins calculées
  assert.equal(rows[0].finPratique, 570);   // 08:00 + 1h30
  assert.equal(rows[0].finTestPratique, 630); // 09:30 + 1h
  assert.equal(rows[0].semaine, 36);
  assert.equal(rows[3].finPratique, 600);   // 08:00 + 2h (HAB-ELEC)
});

test('théorie commune : la ligne 2 de DUPONT hérite de la théorie de la ligne 1', () => {
  const state = seedExamples(freshState());
  const { rows } = computeSchedule(state);
  const r2 = rows[1];
  assert.ok(!r2.errors.some((e) => e.includes('théorique')), r2.errors.join('; '));
});

test('jour non ouvert détecté', () => {
  const state = freshState();
  addInscription(state, {
    stagiaire: 'TEST Un', formation: 'HAB-ELEC', type: 'Initial',
    datePratique: '2026-09-03', debutPratique: 480,
  });
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('jour non ouvert')));
});

test('hors plage horaire détecté', () => {
  const state = freshState();
  addInscription(state, {
    stagiaire: 'TEST Un', formation: 'HAB-ELEC', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 960, // 16:00 + 2h = 18:00 > 17:00
  });
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('hors plage')));
});

test('formateur : 2 catégories différentes en même temps interdit', () => {
  const state = freshState();
  addInscription(state, {
    stagiaire: 'A Un', formation: 'R489-1A', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1',
    dateTheorie: '2026-09-01', dateTestPratique: '2026-09-01', debutTestPratique: 780, testeurId: 'p2',
  });
  addInscription(state, {
    stagiaire: 'B Deux', formation: 'R489-1B', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 510, formateurId: 'p1',
    dateTheorie: '2026-09-01', dateTestPratique: '2026-09-01', debutTestPratique: 840, testeurId: 'p2',
  });
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('2 catégories')));
  assert.ok(rows[1].errors.some((e) => e.includes('2 catégories')));
});

test('R489 Cat 3 : 2 candidats simultanés autorisés, pas en Cat 1A', () => {
  const mk = (formation) => {
    const state = freshState();
    for (const nom of ['A Un', 'B Deux']) {
      addInscription(state, {
        stagiaire: nom, formation, type: 'Initial',
        datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1',
        dateTheorie: '2026-09-01',
        dateTestPratique: '2026-09-01', debutTestPratique: nom === 'A Un' ? 780 : 840,
        testeurId: 'p2',
      });
    }
    return computeSchedule(state).rows;
  };
  const cat3 = mk('R489-3');
  assert.ok(!cat3[0].errors.some((e) => e.includes('simultanés')), cat3[0].errors.join('; '));
  const cat1a = mk('R489-1A');
  assert.ok(cat1a[0].errors.some((e) => e.includes('simultanés')));
});

test('testeur : 2 tests pratiques en même temps interdit (même testeur)', () => {
  const state = freshState();
  for (const [nom, debut] of [['A Un', 480], ['B Deux', 600]]) {
    addInscription(state, {
      stagiaire: nom, formation: 'R489-3', type: 'Initial',
      datePratique: '2026-09-01', debutPratique: debut, formateurId: 'p1',
      dateTheorie: '2026-09-01',
      dateTestPratique: '2026-09-01', debutTestPratique: 780, testeurId: 'p2',
    });
  }
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('2 tests pratiques')));
});

test('testing croisé : 2 tests simultanés OK si testeurs différents', () => {
  const state = freshState();
  addInscription(state, {
    stagiaire: 'A Un', formation: 'R489-3', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1',
    dateTheorie: '2026-09-01',
    dateTestPratique: '2026-09-01', debutTestPratique: 780, testeurId: 'p2',
  });
  addInscription(state, {
    stagiaire: 'B Deux', formation: 'R489-3', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p2',
    dateTheorie: '2026-09-01',
    dateTestPratique: '2026-09-01', debutTestPratique: 780, testeurId: 'p1',
  });
  const { rows } = computeSchedule(state);
  assert.ok(!rows[0].errors.some((e) => e.includes('2 tests pratiques')), rows[0].errors.join('; '));
  assert.ok(!rows[1].errors.some((e) => e.includes('2 tests pratiques')), rows[1].errors.join('; '));
});

test('formateur = testeur du même candidat interdit', () => {
  const state = freshState();
  addInscription(state, {
    stagiaire: 'A Un', formation: 'R489-1A', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1',
    dateTheorie: '2026-09-01',
    dateTestPratique: '2026-09-01', debutTestPratique: 780, testeurId: 'p1',
  });
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('Formateur = testeur')));
});

test('tests manquants signalés pour R489, pas pour HAB-ELEC', () => {
  const state = freshState();
  addInscription(state, {
    stagiaire: 'A Un', formation: 'R489-1A', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 480,
  });
  addInscription(state, {
    stagiaire: 'B Deux', formation: 'HAB-ELEC', type: 'Initial',
    datePratique: '2026-09-02', debutPratique: 480,
  });
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('Test pratique manquant')));
  assert.ok(rows[0].errors.some((e) => e.includes('théorique')));
  assert.ok(!rows[1].errors.some((e) => e.includes('manquant')), rows[1].errors.join('; '));
});

test('charge quotidienne > 6h détectée', () => {
  const state = freshState();
  // 4 × HAB-ELEC (2h) = 8h pour le même formateur, sans chevauchement
  const starts = [480, 600, 720, 840];
  starts.forEach((s, i) => addInscription(state, {
    stagiaire: `S ${i}`, formation: 'HAB-ELEC', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: s, formateurId: 'p1',
  }));
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('Charge')));
});

test('affectation automatique : priorité à l’intervenant du jour', () => {
  const state = freshState();
  state.dayAssignments['2026-09-01'] = { formateur: 'p2', testeur: 'p1' };
  addInscription(state, {
    stagiaire: 'A Un', formation: 'R489-1A', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 480,
    dateTheorie: '2026-09-01',
    dateTestPratique: '2026-09-01', debutTestPratique: 600,
  });
  const { rows } = computeSchedule(state);
  assert.equal(rows[0].formateurEffectif, 'p2');
  assert.equal(rows[0].testeurEffectif, 'p1');
  assert.deepEqual(rows[0].errors, []);
});

test('affectation automatique : bascule si l’intervenant du jour est occupé', () => {
  const state = freshState();
  state.dayAssignments['2026-09-01'] = { formateur: 'p1', testeur: 'p1' };
  // p1 occupé en formation 08:00-09:30 → le test pratique de 08:30 doit aller à p2
  addInscription(state, {
    stagiaire: 'A Un', formation: 'R489-1A', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 480,
    dateTheorie: '2026-09-01',
    dateTestPratique: '2026-09-01', debutTestPratique: 600,
  });
  addInscription(state, {
    stagiaire: 'B Deux', formation: 'R489-1B', type: 'Initial',
    datePratique: '2026-09-02', debutPratique: 480,
    dateTheorie: '2026-09-01',
    dateTestPratique: '2026-09-01', debutTestPratique: 510,
  });
  const { rows } = computeSchedule(state);
  assert.equal(rows[0].formateurEffectif, 'p1');
  assert.equal(rows[1].testeurEffectif, 'p2'); // p1 forme A pendant ce créneau
});

test('testeur non habilité signalé', () => {
  const state = freshState();
  state.team.push({ id: 'p3', name: 'AUTRE A', quals: {} });
  addInscription(state, {
    stagiaire: 'A Un', formation: 'R489-1A', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1',
    dateTheorie: '2026-09-01',
    dateTestPratique: '2026-09-01', debutTestPratique: 600, testeurId: 'p3',
  });
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('Testeur non habilité')));
});

test('chevauchement des créneaux d’un même stagiaire détecté', () => {
  const state = freshState();
  addInscription(state, {
    stagiaire: 'A Un', formation: 'R489-1A', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1',
    dateTheorie: '2026-09-01',
    dateTestPratique: '2026-09-01', debutTestPratique: 600, testeurId: 'p2',
  });
  addInscription(state, {
    stagiaire: 'A Un', formation: 'R489-3', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 510, formateurId: 'p1', // chevauche sa pratique 1A
    dateTestPratique: '2026-09-01', debutTestPratique: 780, testeurId: 'p2',
  });
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('Chevauchement stagiaire')));
});

test('test pratique pendant le créneau théorie interdit (même testeur)', () => {
  const state = freshState();
  addInscription(state, {
    stagiaire: 'A Un', formation: 'R489-1A', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p2',
    dateTheorie: '2026-09-01',
  });
  addInscription(state, {
    stagiaire: 'B Deux', formation: 'R489-1B', type: 'Initial',
    datePratique: '2026-09-02', debutPratique: 480, formateurId: 'p2',
    dateTheorie: '2026-09-01',
    dateTestPratique: '2026-09-01', debutTestPratique: 660, testeurId: 'p1', // 11:00 = théorie
  });
  const { rows } = computeSchedule(state);
  assert.ok(rows[1].errors.some((e) => e.includes('pendant le créneau théorie')), rows[1].errors.join('; '));
});

test('capacité dépassée : 3 candidats simultanés sur 2 chariots R489 Cat 3', () => {
  const state = defaultState();
  for (const [nom, testStart] of [['A Un', 780], ['B Deux', 840], ['C Trois', 900]]) {
    addInscription(state, {
      stagiaire: nom, formation: 'R489-3', type: 'Initial',
      datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1',
      dateTheorie: '2026-09-01',
      dateTestPratique: '2026-09-01', debutTestPratique: testStart, testeurId: 'p2',
    });
  }
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('3 candidats simultanés')), rows[0].errors.join('; '));
});

test('théorie renseignée en double signalée', () => {
  const state = defaultState();
  for (const testStart of [780, 840]) {
    addInscription(state, {
      stagiaire: 'A Un', formation: testStart === 780 ? 'R489-1A' : 'R489-3', type: 'Initial',
      datePratique: '2026-09-01', debutPratique: testStart === 780 ? 480 : 570, formateurId: 'p1',
      dateTheorie: '2026-09-01',
      dateTestPratique: '2026-09-01', debutTestPratique: testStart, testeurId: 'p2',
    });
  }
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('plusieurs lignes')), rows[0].errors.join('; '));
});

test('comptage théorie par stagiaire unique', () => {
  const state = seedExamples(defaultState());
  const sched = computeSchedule(state);
  assert.equal(sched.theoryCandidates('2026-09-01'), 2); // DUPONT + MARTIN
});

test('suggestion automatique de créneaux sans conflit', async () => {
  const { suggestSlots } = await import('../js/engine.js');
  const state = seedExamples(defaultState());
  const found = suggestSlots(state, { stagiaire: 'NOUVEAU Paul', formation: 'R489-1A', type: 'Initial' });
  assert.ok(found, 'aucune proposition');
  // Vérifie que la proposition est réellement sans anomalie
  addInscription(state, found);
  const { rows } = computeSchedule(state);
  assert.deepEqual(rows[rows.length - 1].errors, [], rows[rows.length - 1].errors.join('; '));
});

test('suggestion : théorie omise si déjà planifiée pour la recommandation', async () => {
  const { suggestSlots } = await import('../js/engine.js');
  const state = seedExamples(defaultState());
  const found = suggestSlots(state, { stagiaire: 'EXEMPLE - DUPONT Jean', formation: 'R489-5', type: 'Initial' });
  assert.ok(found);
  assert.equal(found.dateTheorie, null); // théorie R489 déjà posée le 01/09
});

test('testeur théorie non habilité signalé (affectation manuelle du jour)', () => {
  const state = defaultState();
  state.team.push({ id: 'p3', name: 'AUTRE A', quals: {} });
  state.dayAssignments['2026-09-01'] = { testeur: 'p3' };
  addInscription(state, {
    stagiaire: 'A Un', formation: 'R489-1A', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p2',
    dateTheorie: '2026-09-01',
    dateTestPratique: '2026-09-01', debutTestPratique: 600, testeurId: 'p1',
  });
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('Testeur théorie non habilité')), rows[0].errors.join('; '));
});

test('suggestion : le test pratique proposé suit la formation pratique', async () => {
  const { suggestSlots } = await import('../js/engine.js');
  const state = seedExamples(defaultState());
  const found = suggestSlots(state, { stagiaire: 'NOUVEAU Paul', formation: 'R489-1A', type: 'Initial' });
  assert.ok(found);
  if (found.dateTestPratique === found.datePratique) {
    assert.ok(found.debutTestPratique >= found.debutPratique + 90,
      `test à ${found.debutTestPratique} avant fin de pratique ${found.debutPratique + 90}`);
  }
});
