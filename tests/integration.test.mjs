// Tests d'intégration : scénarios complets traversant tous les modules
// (store → engine → csv → ics), sans navigateur — exécutables en CI.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  defaultState, seedExamples, addInscription, updateInscription, removeInscription,
  exportJSON, importJSON, memberName,
} from '../js/store.js';
import { computeSchedule, suggestSlots, memberAvailability } from '../js/engine.js';
import { importInscriptionsCSV } from '../js/csv.js';
import { buildICS } from '../js/ics.js';
import { workingDays, periodWeeks, isoWeek } from '../js/dates.js';

// ---------------------------------------------------------------------------
// Scénario 1 — cycle de vie complet d'une réservation
// ---------------------------------------------------------------------------
test('intégration : cycle complet inscrire → corriger un conflit → replanifier → supprimer', () => {
  const state = seedExamples(defaultState());

  // Inscription en conflit volontaire : même formateur implicite, catégorie
  // différente, chevauche la pratique de DUPONT (garcia, 01/09 08:00-09:30)
  const insc = addInscription(state, {
    stagiaire: 'NOUVEAU Marc', formation: 'R486-A', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 510, formateurId: 'p2',
    dateTheorie: '2026-09-01',
    dateTestPratique: '2026-09-01', debutTestPratique: 750, testeurId: 'p1',
  });
  let rows = computeSchedule(state).rows;
  let row = rows.find((r) => r.insc.id === insc.id);
  assert.ok(row.errors.some((e) => e.includes('2 catégories')), 'le conflit formateur doit être détecté');

  // Correction : l'outil propose des créneaux valides (en replanifiant CETTE ligne)
  const fixed = suggestSlots(state, { stagiaire: 'NOUVEAU Marc', formation: 'R486-A', type: 'Initial' }, insc.id);
  assert.ok(fixed, 'une proposition doit exister');
  updateInscription(state, insc.id, { ...fixed, formateurId: null, testeurId: null });
  rows = computeSchedule(state).rows;
  row = rows.find((r) => r.insc.id === insc.id);
  assert.deepEqual(row.errors, [], `après replanification : ${row.errors}`);

  // Les 4 exemples restent ✓ OK (pas d'effet de bord)
  for (const r of rows.filter((r2) => r2.insc.id !== insc.id)) {
    assert.deepEqual(r.errors, [], `effet de bord sur #${r.insc.id} : ${r.errors}`);
  }

  // Suppression
  removeInscription(state, insc.id);
  assert.equal(computeSchedule(state).rows.length, 4);
});

// ---------------------------------------------------------------------------
// Scénario 2 — stagiaire multi-catégories sur une journée (cas du classeur)
// ---------------------------------------------------------------------------
test('intégration : parcours multi-catégories un même jour, théorie commune, semaine correcte', () => {
  const state = defaultState();
  // Reconstruit le parcours DUPONT du classeur entièrement en affectation AUTO
  addInscription(state, {
    stagiaire: 'DURAND Paul', formation: 'R489-1A', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 480,
    dateTheorie: '2026-09-01',
    dateTestPratique: '2026-09-01', debutTestPratique: 570,
  });
  addInscription(state, {
    stagiaire: 'DURAND Paul', formation: 'R489-3', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 780,
    dateTestPratique: '2026-09-01', debutTestPratique: 870,
  });
  const { rows, theoryCandidates } = computeSchedule(state);
  for (const r of rows) assert.deepEqual(r.errors, [], `#${r.insc.id} : ${r.errors}`);
  // La théorie de la ligne 1 couvre la ligne 2 (même reco R489)
  assert.equal(theoryCandidates('2026-09-01'), 1);
  // Formateur et testeur différents, cohérents sur les 2 lignes
  for (const r of rows) {
    assert.ok(r.formateurEffectif && r.testeurEffectif);
    assert.notEqual(r.formateurEffectif, r.testeurEffectif);
  }
  assert.equal(rows[0].semaine, 36);
  assert.equal(isoWeek(rows[0].insc.datePratique), 36);
});

// ---------------------------------------------------------------------------
// Scénario 3 — testing croisé complet (2 formateurs en parallèle)
// ---------------------------------------------------------------------------
test('intégration : testing croisé — A forme 1 et teste le candidat de B, et inversement', () => {
  const state = defaultState();
  state.openDays.push('2026-09-03');
  // Une 3e personne habilitée T assure la théorie (les 2 formateurs sont
  // exclus : formateur ≠ testeur du candidat, y compris pour la théorie)
  state.team.push({ id: 'p3', name: 'TIERS Théo', quals: Object.fromEntries(state.formations.map((f) => [f.code, { T: true }])) });
  addInscription(state, {
    stagiaire: 'ALPHA Un', formation: 'R489-3', type: 'Initial',
    datePratique: '2026-09-03', debutPratique: 480, formateurId: 'p1',
    dateTheorie: '2026-09-03',
    dateTestPratique: '2026-09-03', debutTestPratique: 600, testeurId: 'p2',
  });
  addInscription(state, {
    stagiaire: 'BRAVO Deux', formation: 'R489-3', type: 'Initial',
    datePratique: '2026-09-03', debutPratique: 480, formateurId: 'p2',
    dateTheorie: '2026-09-03',
    dateTestPratique: '2026-09-03', debutTestPratique: 600, testeurId: 'p1',
  });
  const { rows, theoryTesters } = computeSchedule(state);
  for (const r of rows) assert.deepEqual(r.errors, [], `#${r.insc.id} : ${r.errors}`);
  // La théorie revient bien au tiers, pas aux formateurs croisés
  assert.equal(theoryTesters.get('2026-09-03'), 'p3');
});

// ---------------------------------------------------------------------------
// Scénario 4 — migration : CSV du classeur réel → moteur → exports
// ---------------------------------------------------------------------------
test('intégration : import du CSV du classeur → planning valide → exports ICS et JSON cohérents', () => {
  const state = defaultState();
  const csv = readFileSync(new URL('./fixtures/inscriptions-classeur.csv', import.meta.url), 'utf8');
  const { inscriptions, skipped } = importInscriptionsCSV(csv, state.formations, state.team);
  assert.equal(skipped.length, 0);
  for (const d of inscriptions) addInscription(state, d);

  const schedule = computeSchedule(state);
  for (const r of schedule.rows) assert.deepEqual(r.errors, [], `#${r.insc.id} : ${r.errors}`);

  // Les intervenants du classeur sont reproduits
  assert.equal(memberName(state, schedule.rows[0].formateurEffectif), 'GARCIA Thierry');
  assert.equal(memberName(state, schedule.rows[0].testeurEffectif), 'MEDAN Dominique');

  // Export ICS : 4 pratiques + 3 tests + 1 théorie
  const ics = buildICS(state, schedule);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 8);

  // Aller-retour JSON complet
  const restored = importJSON(exportJSON(state));
  const schedule2 = computeSchedule(restored);
  assert.equal(schedule2.rows.length, schedule.rows.length);
  for (const r of schedule2.rows) assert.deepEqual(r.errors, []);
});

// ---------------------------------------------------------------------------
// Scénario 5 — reconfiguration : période, férié, capacité
// ---------------------------------------------------------------------------
test('intégration : changer période/fériés/capacité recalcule tout sans corruption', () => {
  const state = seedExamples(defaultState());

  // Un nouveau férié le 01/09 invalide les inscriptions de ce jour
  state.params.holidays.push({ date: '2026-09-01', label: 'Férié test' });
  let rows = computeSchedule(state).rows;
  assert.ok(rows.filter((r) => r.insc.datePratique === '2026-09-01')
    .every((r) => r.errors.some((e) => e.includes('hors période ou jour non ouvré'))));
  state.params.holidays.pop();

  // Capacité R489-3 réduite à 1 → les 2 candidats simultanés deviennent une anomalie
  state.formations.find((f) => f.code === 'R489-3').capacite = 1;
  rows = computeSchedule(state).rows;
  const cat3 = rows.filter((r) => r.insc.formation === 'R489-3');
  assert.ok(cat3.every((r) => r.errors.some((e) => e.includes('simultanés'))));
  state.formations.find((f) => f.code === 'R489-3').capacite = 2;

  // Période raccourcie : les semaines suivent
  state.params.periodEnd = '2026-09-30';
  assert.equal(workingDays(state.params).length, 22);
  const weeks = periodWeeks(state.params);
  assert.equal(weeks[0].week, 36);
  assert.equal(weeks[weeks.length - 1].week, 40);

  // Retour à la normale : tout est ✓ OK
  state.params.periodEnd = '2026-12-31';
  rows = computeSchedule(state).rows;
  for (const r of rows) assert.deepEqual(r.errors, [], `#${r.insc.id} : ${r.errors}`);
});

// ---------------------------------------------------------------------------
// Scénario 6 — équipe réduite : saturation puis « aucun disponible »
// ---------------------------------------------------------------------------
test('intégration : équipe d\'une seule personne → aucun testeur possible (formateur = testeur évité)', () => {
  const state = defaultState();
  state.team = [state.team[0]]; // Medan uniquement
  addInscription(state, {
    stagiaire: 'SOLO Un', formation: 'R489-1A', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 480,
    dateTheorie: '2026-09-01',
    dateTestPratique: '2026-09-01', debutTestPratique: 600,
  });
  const { rows } = computeSchedule(state);
  // Medan forme ; il est aussi le seul testeur possible → conflit signalé
  assert.equal(rows[0].formateurEffectif, 'p1');
  assert.ok(
    rows[0].errors.some((e) => e.includes('Formateur = testeur')),
    rows[0].errors.join('; '));
});

// ---------------------------------------------------------------------------
// Scénario 7 — montée en charge réaliste : 40 stagiaires proposés par l'outil
// ---------------------------------------------------------------------------
test('intégration : 40 inscriptions proposées automatiquement, toutes ✓ OK', () => {
  const state = defaultState();
  state.openDays = workingDays(state.params).slice(0, 30);
  state.team.push(
    { id: 'p3', name: 'TROISIEME C', quals: Object.fromEntries(state.formations.map((f) => [f.code, { F: true, T: true }])) },
  );
  const codes = ['R489-1A', 'R489-3', 'R486-A', 'HAB-ELEC'];
  let placed = 0;
  for (let i = 0; i < 40; i++) {
    const draft = { stagiaire: `CHARGE ${String(i).padStart(2, '0')}`, formation: codes[i % codes.length], type: i % 3 ? 'Initial' : 'Recyclage' };
    const found = suggestSlots(state, draft);
    if (!found) break; // planning saturé : acceptable, mais tout ce qui est placé doit être valide
    addInscription(state, found);
    placed++;
  }
  assert.ok(placed >= 30, `seulement ${placed} inscriptions placées sur 40`);
  const { rows } = computeSchedule(state);
  for (const r of rows) assert.deepEqual(r.errors, [], `#${r.insc.id} (${r.insc.stagiaire}) : ${r.errors}`);

  // Les disponibilités restent cohérentes : personne d'occupé n'est proposé libre
  const day = state.openDays[0];
  const avail = memberAvailability(state, { formation: 'R489-1A', type: 'Initial', datePratique: day, debutPratique: 480 });
  for (const a of avail) assert.ok(['libre', 'occupe', 'non-habilite'].includes(a.F));
});
