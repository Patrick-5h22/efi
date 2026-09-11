// Parcours multi-catégories — ce que le serveur MCP interrogera pour répondre
// à « R489 1A, 3 et 5 à partir du 15 septembre, qu'est-ce qu'on peut faire ? ».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/store.js';
import { suggestParcours, suggestSlots, computeSchedule } from '../js/engine.js';

const QUALS_R489 = { 'R489-1A': { F: true, T: true }, 'R489-3': { F: true, T: true }, 'R489-5': { F: true, T: true } };

function fixture({ jours = ['2026-09-14', '2026-09-15', '2026-09-16'], pause = false } = {}) {
  const state = defaultState();
  state.team = [
    { id: 'p1', name: 'MEDAN Dominique', quals: structuredClone(QUALS_R489) },
    { id: 'p2', name: 'GARCIA Thierry', quals: structuredClone(QUALS_R489) },
    { id: 'p3', name: 'LEROY Sophie', quals: structuredClone(QUALS_R489) },
  ];
  state.openDays = jours;
  state.inscriptions = [];
  if (pause) state.params.pauseActive = true;
  return state;
}

const CATS = ['R489-3', 'R489-5', 'R489-1A'];

// --- Composition ---

test('parcours : les trois catégories sont placées', () => {
  const state = fixture();
  const [opt] = suggestParcours(state, { stagiaire: 'DURAND Thomas', formations: CATS, type: 'Initial' });
  assert.ok(opt, 'une proposition est attendue');
  assert.equal(opt.lignes.length, 3);
  assert.deepEqual(opt.lignes.map((l) => l.formation), CATS, 'l’ordre demandé est respecté');
});

test('parcours : la théorie est mutualisée — un seul créneau pour la recommandation', () => {
  const state = fixture();
  const [opt] = suggestParcours(state, { stagiaire: 'DURAND Thomas', formations: CATS, type: 'Initial' });
  const theories = opt.seances.filter((s) => s.genre === 'theorie');
  assert.equal(theories.length, 1, 'R489 ne doit apparaître qu’une fois en théorie');
  assert.match(theories[0].libelle, /R489/);

  // Une seule des trois lignes porte la date de théorie
  const portees = opt.lignes.filter((l) => l.dateTheorie);
  assert.equal(portees.length, 1, 'la théorie n’est saisie que sur une ligne');
});

test('parcours : chaque catégorie a son test pratique', () => {
  const state = fixture();
  const [opt] = suggestParcours(state, { stagiaire: 'DURAND Thomas', formations: CATS, type: 'Initial' });
  const tests = opt.seances.filter((s) => s.genre === 'test');
  assert.equal(tests.length, 3, 'un test pratique par catégorie');
});

test('parcours : aucune anomalie dans une proposition', () => {
  const state = fixture();
  const [opt] = suggestParcours(state, { stagiaire: 'DURAND Thomas', formations: CATS, type: 'Initial' });
  const sim = structuredClone(state);
  for (const l of opt.lignes) sim.inscriptions.push(structuredClone(l));
  const { rows } = computeSchedule(sim);
  for (const r of rows) {
    assert.deepEqual(r.errors, [], `${r.insc.formation} : ${r.errors.join(' | ')}`);
  }
});

test('parcours : le déroulé est chronologique', () => {
  const state = fixture();
  const [opt] = suggestParcours(state, { stagiaire: 'DURAND Thomas', formations: CATS, type: 'Initial' });
  for (let i = 1; i < opt.seances.length; i++) {
    const a = opt.seances[i - 1], b = opt.seances[i];
    assert.ok(a.date < b.date || (a.date === b.date && a.debut <= b.debut),
      `${a.date} ${a.debut} devrait précéder ${b.date} ${b.debut}`);
  }
});

test('parcours : chaque séance nomme un intervenant', () => {
  const state = fixture();
  const [opt] = suggestParcours(state, { stagiaire: 'DURAND Thomas', formations: CATS, type: 'Initial' });
  for (const s of opt.seances) {
    assert.ok(s.intervenant, `séance « ${s.libelle} » sans intervenant`);
  }
});

// --- « À partir du » ---

test('parcours : aPartirDu est respecté', () => {
  const state = fixture();
  const [opt] = suggestParcours(state, {
    stagiaire: 'DURAND Thomas', formations: CATS, type: 'Initial', aPartirDu: '2026-09-16',
  });
  assert.ok(opt, 'une proposition est attendue');
  for (const j of opt.jours) assert.ok(j >= '2026-09-16', `${j} est antérieur à la date demandée`);
});

test('suggestSlots : aPartirDu écarte les jours antérieurs', () => {
  const state = fixture();
  const draft = suggestSlots(state, {
    stagiaire: 'DURAND Thomas', formation: 'R489-3', type: 'Initial', aPartirDu: '2026-09-16',
  });
  assert.ok(draft);
  assert.ok(draft.datePratique >= '2026-09-16', draft.datePratique);
});

test('suggestSlots : sans aPartirDu, le comportement d’origine est inchangé', () => {
  const state = fixture();
  const draft = suggestSlots(state, { stagiaire: 'DURAND Thomas', formation: 'R489-3', type: 'Initial' });
  assert.equal(draft.datePratique, '2026-09-14', 'le premier jour ouvert est retenu');
});

// --- Plusieurs options ---

test('parcours : deux options portent sur des jours distincts', () => {
  const state = fixture();
  const opts = suggestParcours(state, {
    stagiaire: 'DURAND Thomas', formations: CATS, type: 'Initial', maxOptions: 2,
  });
  assert.equal(opts.length, 2, `${opts.length} option(s) obtenue(s)`);
  assert.notEqual(opts[0].jours[0], opts[1].jours[0], 'les deux options doivent démarrer un autre jour');
});

test('parcours : maxOptions borne le nombre de propositions', () => {
  const state = fixture();
  const opts = suggestParcours(state, {
    stagiaire: 'DURAND Thomas', formations: CATS, type: 'Initial', maxOptions: 1,
  });
  assert.equal(opts.length, 1);
});

// --- Cas limites ---

test('parcours : aucun jour ouvert → aucune proposition, sans planter', () => {
  const state = fixture({ jours: [] });
  assert.deepEqual(suggestParcours(state, { stagiaire: 'DURAND Thomas', formations: CATS, type: 'Initial' }), []);
});

test('parcours : entrée vide ou incomplète → tableau vide', () => {
  const state = fixture();
  assert.deepEqual(suggestParcours(state, { stagiaire: '', formations: CATS }), []);
  assert.deepEqual(suggestParcours(state, { stagiaire: 'X', formations: [] }), []);
  assert.deepEqual(suggestParcours(state, { stagiaire: 'X', formations: null }), []);
});

test('parcours : les réservations existantes sont respectées', () => {
  const state = fixture({ jours: ['2026-09-14'] });
  // On sature le 14 avec une autre ligne : la proposition doit échouer plutôt
  // que de superposer, puisqu'il n'y a aucun autre jour ouvert.
  state.inscriptions = [{
    id: 1, stagiaire: 'AUTRE Candidat', formation: 'R489-3', type: 'Initial',
    statut: 'confirmee', modeTheorie: 'distance',
    datePratique: '2026-09-14', debutPratique: 480,
    dateTheorie: '2026-09-14',
    dateTestPratique: '2026-09-14', debutTestPratique: 780,
  }];
  state.nextId = 2;
  const opts = suggestParcours(state, { stagiaire: 'DURAND Thomas', formations: CATS, type: 'Initial' });
  // Soit ça tient sans conflit, soit ça ne propose rien — jamais une
  // proposition en anomalie.
  for (const opt of opts) {
    const sim = structuredClone(state);
    for (const l of opt.lignes) sim.inscriptions.push(structuredClone(l));
    const { rows } = computeSchedule(sim);
    for (const r of rows) assert.deepEqual(r.errors, [], r.errors.join(' | '));
  }
});

test('parcours : la pause déjeuner est respectée quand elle est active', () => {
  const state = fixture({ pause: true });
  const [opt] = suggestParcours(state, { stagiaire: 'DURAND Thomas', formations: CATS, type: 'Initial' });
  assert.ok(opt, 'une proposition reste possible avec la pause');
  const { pauseDebut, pauseFin } = state.params;
  for (const s of opt.seances) {
    assert.ok(!(s.debut < pauseFin && s.fin > pauseDebut),
      `« ${s.libelle} » (${s.debut}–${s.fin}) chevauche la pause`);
  }
});

test('parcours : les lignes proposées sont pré-réservées, pas confirmées', () => {
  const state = fixture();
  const [opt] = suggestParcours(state, { stagiaire: 'DURAND Thomas', formations: CATS, type: 'Initial' });
  for (const l of opt.lignes) {
    assert.equal(l.statut, 'pre', 'une proposition ne confirme jamais d’elle-même');
  }
});

test('parcours : le libellé ne répète pas le mot « pratique »', () => {
  const state = fixture();
  const [opt] = suggestParcours(state, { stagiaire: 'DURAND Thomas', formations: CATS, type: 'Initial' });
  for (const s of opt.seances) {
    const occurrences = (s.libelle.match(/pratique/gi) || []).length;
    assert.ok(occurrences <= 1, `« ${s.libelle} » dit « pratique » ${occurrences} fois`);
  }
  const prat = opt.seances.find((s) => s.genre === 'pratique');
  assert.equal(prat.libelle, 'Formation pratique — R489 Cat 3');
});
