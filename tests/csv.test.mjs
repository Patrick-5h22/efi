import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, importInscriptionsCSV } from '../js/csv.js';
import { DEFAULT_FORMATIONS } from '../js/config.js';

test('parseCSV : guillemets, séparateur auto, BOM', () => {
  const rows = parseCSV('﻿"a;x";b\n"l1 ""quote""";2\n');
  assert.deepEqual(rows, [['a;x', 'b'], ['l1 "quote"', '2']]);
});

test('import CSV au format export de l’application', () => {
  const csv = [
    'N°;Stagiaire;Formation;Type;Durée pratique;Date pratique;Début pratique;Fin pratique;Date théorie;Heure théorie;Date test pratique;Début test;Fin test',
    '1;DUPONT Jean;Pratique R489 Cat 1A;Initial;01:30;01/09/2026;08:00;09:30;01/09/2026;11:00;01/09/2026;09:30;10:30',
    '2;MARTIN Claire;R486-A;Recyclage;02:00;02/09/2026;08:00;10:00;;;02/09/2026;13:00;14:00',
  ].join('\r\n');
  const { inscriptions, skipped } = importInscriptionsCSV(csv, DEFAULT_FORMATIONS);
  assert.equal(skipped.length, 0);
  assert.equal(inscriptions.length, 2);
  assert.deepEqual(inscriptions[0], {
    stagiaire: 'DUPONT Jean', formation: 'R489-1A', type: 'Initial',
    datePratique: '2026-09-01', debutPratique: 480,
    dateTheorie: '2026-09-01',
    dateTestPratique: '2026-09-01', debutTestPratique: 570,
    formateurId: null, testeurId: null,
  });
  assert.equal(inscriptions[1].formation, 'R486-A');
  assert.equal(inscriptions[1].type, 'Recyclage');
  assert.equal(inscriptions[1].dateTheorie, null);
});

test('import CSV : lignes invalides ignorées avec raison', () => {
  const csv = 'Stagiaire;Formation\n;R489-1A\nX Y;FORMATION INCONNUE\nZ W;Pratique R489 Cat 3\n';
  const { inscriptions, skipped } = importInscriptionsCSV(csv, DEFAULT_FORMATIONS);
  assert.equal(inscriptions.length, 1);
  assert.equal(inscriptions[0].formation, 'R489-3');
  assert.equal(skipped.length, 2);
});

test('import du CSV réel exporté du classeur Excel : 4 lignes ✓ OK', async () => {
  const { readFileSync } = await import('node:fs');
  const { defaultState, addInscription } = await import('../js/store.js');
  const { computeSchedule } = await import('../js/engine.js');
  const text = readFileSync(new URL('./fixtures/inscriptions-classeur.csv', import.meta.url), 'utf8');
  const state = defaultState();
  const { inscriptions, skipped } = importInscriptionsCSV(text, state.formations, state.team);
  assert.equal(skipped.length, 0);
  assert.equal(inscriptions.length, 4);
  for (const d of inscriptions) addInscription(state, d);
  const { rows } = computeSchedule(state);
  for (const r of rows) assert.deepEqual(r.errors, [], `#${r.insc.id}: ${r.errors}`);
  // Intervenants identiques au classeur (garcia forme, Medan teste)
  assert.equal(rows[0].formateurEffectif, 'p2');
  assert.equal(rows[0].testeurEffectif, 'p1');
});
