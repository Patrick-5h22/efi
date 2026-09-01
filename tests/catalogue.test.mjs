// Catalogue de formations paramétrable : produits R485, paramètre de charge
// comptée, et migration des états existants.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, migrate, addInscription } from '../js/store.js';
import { chargeComptee, FORMATION_DEFAUT, formationByCode } from '../js/config.js';
import { computeSchedule, occupationSummary } from '../js/engine.js';

function fixture() {
  const state = defaultState();
  state.team = [
    { id: 'p1', name: 'MEDAN Dominique', quals: Object.fromEntries(state.formations.map((f) => [f.code, { F: true, T: true }])) },
    { id: 'p2', name: 'GARCIA Thierry', quals: Object.fromEntries(state.formations.map((f) => [f.code, { F: true, T: true }])) },
  ];
  state.openDays = ['2026-09-01', '2026-09-02'];
  return state;
}

test('catalogue : R485 Cat 1 et Cat 2 livrées avec les durées du classeur', () => {
  const state = defaultState();
  for (const code of ['R485-1', 'R485-2']) {
    const f = formationByCode(state.formations, code);
    assert.ok(f, `${code} présente au catalogue`);
    assert.equal(f.reco, 'R485');
    assert.equal(f.dureeInitial, 90, '1h30 en initial');
    assert.equal(f.dureeRecyclage, 60, '1h00 en recyclage');
    assert.equal(f.tests, true, 'test pratique obligatoire');
    assert.equal(f.capacite, 1);
  }
});

test('migration : R485 injectée dans un état antérieur, chargeComptee initialisé', () => {
  const old = {
    version: 1,
    formations: [{ code: 'HAB-ELEC', label: 'Hab élec', reco: 'HAB ELEC', dureeInitial: 120, dureeRecyclage: 120, tests: false, capacite: 1 }],
    inscriptions: [],
  };
  const migrated = migrate(old);
  assert.ok(formationByCode(migrated.formations, 'R485-1'), 'R485-1 ajoutée');
  assert.ok(formationByCode(migrated.formations, 'R485-2'), 'R485-2 ajoutée');
  // Les formations préexistantes reçoivent les nouveaux champs
  const hab = formationByCode(migrated.formations, 'HAB-ELEC');
  assert.equal(hab.chargeComptee, true);
  assert.equal(hab.testOnly, false);
  // L'AIPR du catalogue est réparée jusque sur sa charge
  const aipr = formationByCode(migrated.formations, 'AIPR');
  assert.equal(aipr.chargeComptee, false, 'surveillance : charge non comptée');
});

test('migration : une AIPR préexistante avec charge comptée est corrigée', () => {
  const old = {
    version: 1,
    formations: [{ code: 'AIPR', label: 'AIPR maison', reco: 'AIPR', dureeInitial: 120, dureeRecyclage: 120, tests: true, capacite: 1 }],
    inscriptions: [],
  };
  const aipr = formationByCode(migrate(old).formations, 'AIPR');
  assert.equal(aipr.testOnly, true);
  assert.equal(aipr.tests, false);
  assert.equal(aipr.chargeComptee, false);
  assert.equal(aipr.label, 'AIPR maison', 'les personnalisations sont conservées');
});

test('chargeComptee() : comptée par défaut, exclue seulement si explicitement false', () => {
  assert.equal(chargeComptee({ code: 'X' }), true, 'champ absent = comptée');
  assert.equal(chargeComptee({ code: 'X', chargeComptee: true }), true);
  assert.equal(chargeComptee({ code: 'X', chargeComptee: false }), false);
  assert.equal(chargeComptee(null), true, 'formation inconnue : ne fausse pas le calcul');
  assert.equal(FORMATION_DEFAUT.chargeComptee, true, 'une création est comptée par défaut');
});

test('charge : une formation hors charge n’entre pas dans le plafond quotidien', () => {
  const state = fixture();
  // Produit maison de 4h, sur le même formateur, deux fois dans la journée : 8h
  state.formations.push({
    code: 'SUP', label: 'Supervision plateau', reco: 'SUP',
    dureeInitial: 240, dureeRecyclage: 240, tests: false, capacite: 4,
    testOnly: false, chargeComptee: true,
  });
  for (const m of state.team) m.quals.SUP = { F: true, T: true };
  addInscription(state, { stagiaire: 'UN', formation: 'SUP', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1' });
  addInscription(state, { stagiaire: 'DEUX', formation: 'SUP', type: 'Initial', datePratique: '2026-09-01', debutPratique: 720, formateurId: 'p1' });

  const over = computeSchedule(state).rows;
  assert.ok(over[0].errors.some((e) => e.includes('Charge >')), '8h dépassent les 6h : ' + over[0].errors.join(' | '));

  // Le même planning, charge non comptée : plus d'anomalie de charge
  formationByCode(state.formations, 'SUP').chargeComptee = false;
  const free = computeSchedule(state).rows;
  assert.ok(!free[0].errors.some((e) => e.includes('Charge >')), free[0].errors.join(' | '));
  assert.ok(!free[1].errors.some((e) => e.includes('Charge >')));
});

test('occupation : une formation hors charge ne pèse pas dans le taux', () => {
  const state = fixture();
  addInscription(state, { stagiaire: 'UN', formation: 'HAB-ELEC', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1' });
  const avec = occupationSummary(state, computeSchedule(state), 'periode', '2026-09-01');
  assert.ok(avec.hours > 0, 'la formation compte');

  formationByCode(state.formations, 'HAB-ELEC').chargeComptee = false;
  const sans = occupationSummary(state, computeSchedule(state), 'periode', '2026-09-01');
  assert.equal(sans.hours, 0, 'charge non comptée : 0 heure mobilisée');
});

test('catalogue : une formation ajoutée est planifiable dès que l’habilitation est cochée', () => {
  const state = fixture();
  state.formations.push({
    code: 'R482-B', label: 'Pratique R482 Cat B', reco: 'R482',
    dureeInitial: 120, dureeRecyclage: 90, tests: false, capacite: 1,
    testOnly: false, chargeComptee: true,
  });
  addInscription(state, { stagiaire: 'NOUVEAU Produit', formation: 'R482-B', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480 });

  // Personne d'habilité : le moteur le signale au lieu d'affecter au hasard
  const sansHabil = computeSchedule(state).rows[0];
  assert.ok(sansHabil.errors.some((e) => e.includes('Aucun formateur disponible')), sansHabil.errors.join(' | '));

  // Habilitation cochée dans Équipe → planification propre
  state.team[0].quals['R482-B'] = { F: true, T: false };
  const row = computeSchedule(state).rows[0];
  assert.equal(row.errors.length, 0, row.errors.join(' | '));
  assert.equal(row.formateurEffectif, 'p1');
  assert.equal(row.finPratique, 480 + 120);
});
