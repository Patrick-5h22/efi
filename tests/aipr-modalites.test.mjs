// AIPR : deux modalités, et une durée de test qui cesse d'être globale.
//
// Demande d'Emmanuel (courriel du 18/09/2026) : l'AIPR se vend de deux façons,
// et les deux doivent coexister dans le catalogue.
//
//   | Modalité              | Ce qui se planifie        | Intervenant           |
//   |-----------------------|---------------------------|-----------------------|
//   | Épreuve seule         | le QCM surveillé          | testeur, hors charge  |
//   | Formation + épreuve   | la formation, PUIS le QCM | formateur, puis testeur |
//
// La seconde modalité a buté sur un paramètre : « practicalTestDuration »
// était GLOBAL, à 1h00, alors que le QCM AIPR tient 2h00. Sans durée de test
// par formation, la seconde modalité se planifiait avec une épreuve d'une
// heure — ou il fallait fausser le paramètre pour tous les dispositifs. C'est
// aussi ce qui bloquait les durées R482 (A = 1h30, les autres 1h00).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, migrate } from '../js/store.js';
import { computeSchedule, occupancyByDay, availableSlotsFor, suggestSlots, memberAvailability } from '../js/engine.js';
import {
  dureeTestFor, testSurveille, modaliteDe, appliquerModalite, MODALITES_SEANCE,
  formationByCode,
} from '../js/config.js';

const J = '2026-09-21'; // lundi
const K = '2026-09-22';

function etat() {
  const s = defaultState();
  s.openDays = [J, K];
  s.inscriptions = [];
  s.dayPresence = {};
  return s;
}

const ligne = (over = {}) => ({
  id: 1, stagiaire: 'CANDIDAT Un', formation: 'AIPR-FORM', type: 'Initial',
  statut: 'confirmee', modeTheorie: 'distance',
  datePratique: J, debutPratique: 480, ...over,
});

// --- Le catalogue ---------------------------------------------------------

test('AIPR : les deux modalités sont au catalogue, et sélectionnables', () => {
  const { formations } = defaultState();
  const aipr = formations.filter((f) => f.reco === 'AIPR');
  assert.equal(aipr.length, 2, 'les deux modalités coexistent');

  const seule = formationByCode(formations, 'AIPR');
  const avec = formationByCode(formations, 'AIPR-FORM');

  // Épreuve seule : une seule séance, tenue par un testeur, hors charge.
  assert.equal(seule.testOnly, true);
  assert.equal(seule.tests, false);
  assert.equal(seule.chargeComptee, false);

  // Formation + épreuve : deux séances. La formation compte dans la charge,
  // l'épreuve reste de la surveillance.
  assert.equal(avec.testOnly, false);
  assert.equal(avec.tests, true, 'l’épreuve occupe le créneau de test');
  assert.equal(avec.chargeComptee, true, 'la formation, elle, mobilise un formateur');
  assert.equal(avec.testSurveille, true);
  assert.equal(avec.dureeTest, 120, 'le QCM tient 2h00, comme dans l’autre modalité');

  // Les trois modalités possibles sont exactement celles qu'offre l'écran.
  assert.deepEqual(MODALITES_SEANCE.map((m) => m.id),
    ['formation', 'epreuve', 'formation-epreuve']);
  assert.equal(modaliteDe(seule), 'epreuve');
  assert.equal(modaliteDe(avec), 'formation-epreuve');
  assert.equal(modaliteDe(formationByCode(formations, 'R489-1A')), 'formation');
});

test('modalité : aucun état incohérent n’est atteignable', () => {
  // Le risque de trois drapeaux libres : une « épreuve seule » qui réclamerait
  // par ailleurs un test séparé. Le choix unique l'interdit par construction.
  for (const m of MODALITES_SEANCE) {
    const f = appliquerModalite({ tests: true, testOnly: true, testSurveille: true }, m.id);
    assert.equal(modaliteDe(f), m.id, `aller-retour sur ${m.id}`);
    assert.ok(!(f.testOnly && f.tests), 'une épreuve seule n’a pas de test séparé');
    assert.ok(!(f.testOnly && f.testSurveille), 'l’épreuve seule n’est pas « le test » de quoi que ce soit');
  }
  // Repasser en « formation + épreuve » rallume le test, même éteint avant.
  const f = appliquerModalite({ tests: false }, 'formation-epreuve');
  assert.equal(f.tests, true);
});

// --- La durée de test, par formation --------------------------------------

test('durée de test : la valeur du catalogue l’emporte, vide = paramètre global', () => {
  const params = { practicalTestDuration: 60 };
  assert.equal(dureeTestFor({ dureeTest: 120 }, params), 120);
  assert.equal(dureeTestFor({ dureeTest: null }, params), 60, 'vide : durée générale');
  assert.equal(dureeTestFor({}, params), 60, 'champ absent : durée générale');
  assert.equal(dureeTestFor(undefined, params), 60, 'formation inconnue : durée générale');
  // 0 ne veut pas dire « test instantané » mais « rien de saisi ».
  assert.equal(dureeTestFor({ dureeTest: 0 }, params), 60);
  assert.equal(dureeTestFor({ dureeTest: -30 }, params), 60);
});

test('durée de test : la fin de l’épreuve suit la formation, pas le paramètre', () => {
  const s = etat();
  s.inscriptions = [ligne({ dateTestPratique: J, debutTestPratique: 840 })];
  const { rows } = computeSchedule(s);
  assert.equal(rows[0].dureeTest, 120);
  assert.equal(rows[0].finTestPratique, 960, '14:00 + 2h00 = 16:00');

  // Un test R489 continue de suivre le paramètre global (1h00).
  const t = etat();
  t.inscriptions = [ligne({ formation: 'R489-1A', dateTestPratique: J, debutTestPratique: 840 })];
  const r = computeSchedule(t).rows[0];
  assert.equal(r.finTestPratique, 900, '14:00 + 1h00 = 15:00');
});

test('durée de test : une épreuve qui dépasse la fin de journée est une anomalie', () => {
  const s = etat();
  // 16:00 + 2h00 = 18:00, au-delà des 17:00 de la journée.
  s.inscriptions = [ligne({ dateTestPratique: J, debutTestPratique: 960 })];
  const row = computeSchedule(s).rows[0];
  assert.ok(row.errors.some((e) => /Test pratique/.test(e)),
    `attendu une anomalie d’horaire, obtenu : ${row.errors.join(' | ')}`);

  // Avec la durée globale d'une heure, la même heure de début passerait : ce
  // test échouerait si la durée du catalogue était ignorée.
  const t = etat();
  // La R489 réclame en plus son test théorique — sans rapport avec l'horaire
  // qu'on vérifie ici, mais il ferait du bruit dans la comparaison.
  t.inscriptions = [ligne({
    formation: 'R489-1A', dateTheorie: J,
    dateTestPratique: J, debutTestPratique: 960,
  })];
  assert.deepEqual(computeSchedule(t).rows[0].errors, []);
});

// --- L'épreuve surveillée n'est pas un test que l'on fait passer -----------

test('épreuve surveillée : deux candidats à la même heure, un seul testeur', () => {
  const s = etat();
  s.inscriptions = [
    ligne({ id: 1, dateTestPratique: K, debutTestPratique: 480, testeurId: 'p1' }),
    ligne({
      id: 2, stagiaire: 'CANDIDAT Deux', datePratique: K, debutPratique: 780,
      dateTestPratique: K, debutTestPratique: 480, testeurId: 'p1',
    }),
  ];
  const { rows } = computeSchedule(s);
  for (const r of rows) {
    assert.ok(!r.errors.some((e) => /déjà|occupé|conflit|chevauche/i.test(e)),
      `surveillance : pas de conflit de testeur, obtenu : ${r.errors.join(' | ')}`);
  }

  // Le même cumul sur un VRAI test pratique, lui, reste un conflit.
  const t = etat();
  t.inscriptions = [
    ligne({ id: 1, formation: 'R489-1A', dateTestPratique: K, debutTestPratique: 480, testeurId: 'p1' }),
    ligne({
      id: 2, formation: 'R489-1A', stagiaire: 'CANDIDAT Deux',
      datePratique: K, debutPratique: 780,
      dateTestPratique: K, debutTestPratique: 480, testeurId: 'p1',
    }),
  ];
  const conflits = computeSchedule(t).rows.flatMap((r) => r.errors);
  assert.ok(conflits.length, 'deux tests pratiques simultanés sur le même testeur : anomalie');
});

test('épreuve surveillée : elle ne pèse pas dans le taux d’occupation', () => {
  const avec = etat();
  avec.inscriptions = [ligne({ dateTestPratique: J, debutTestPratique: 840 })];
  const sans = etat();
  sans.inscriptions = [ligne()];

  const occ = (s) => occupancyByDay(s, computeSchedule(s)).get(J).busy;
  assert.equal(occ(avec), occ(sans),
    'la surveillance du QCM ne mobilise pas de temps d’intervenant');

  // La partie FORMATION, elle, pèse bien : 3h30 sur des créneaux de 30 min.
  assert.equal(occ(sans), 7);
});

test('épreuve surveillée : habilité et présent suffit, même occupé ailleurs', () => {
  const s = etat();
  // p1 tient une formation R489 de 08:00 à 09:30 ce jour-là.
  s.inscriptions = [{
    id: 9, stagiaire: 'AUTRE Un', formation: 'R489-1A', type: 'Initial',
    statut: 'confirmee', modeTheorie: 'distance',
    datePratique: J, debutPratique: 480, formateurId: 'p1',
  }];
  s.team = [s.team[0]]; // p1 seul : aucune échappatoire

  const dispo = memberAvailability(s, {
    formation: 'AIPR-FORM', type: 'Initial',
    dateTestPratique: J, debutTestPratique: 480,
  });
  assert.equal(dispo.find((m) => m.id === 'p1').T, 'libre',
    'surveiller un QCM ne demande pas d’être libre de tout');

  // Créneaux offerts pour l'épreuve : toute la journée, pause comprise, sans
  // que les occupations de p1 n'en retirent.
  const creneaux = availableSlotsFor(s, { formation: 'AIPR-FORM', type: 'Initial', date: J, role: 'test' });
  assert.ok(creneaux.includes(480), 'l’épreuve peut commencer pendant la formation de p1');
  // 08:00 → 15:00, soit les créneaux qui laissent 2h00 avant 17:00.
  assert.equal(creneaux.at(-1), 900);
});

// --- Ce que propose le moteur ---------------------------------------------

test('proposition : la formation AIPR puis son épreuve de 2h00, dans la journée', () => {
  const s = etat();
  const prop = suggestSlots(s, {
    stagiaire: 'CANDIDAT Un', formation: 'AIPR-FORM', type: 'Initial', aujourdHui: J,
  });
  assert.ok(prop, 'une proposition existe');
  assert.equal(prop.datePratique, J);
  assert.ok(prop.dateTestPratique, 'l’épreuve est proposée avec');

  const sim = etat();
  sim.inscriptions = [{ ...ligne(), ...prop, id: 1 }];
  const row = computeSchedule(sim).rows[0];
  assert.deepEqual(row.errors, [], 'la proposition ne porte aucune anomalie');
  assert.equal(row.finTestPratique - row.insc.debutTestPratique, 120);

  // L'épreuve ne peut pas précéder la formation qu'elle sanctionne.
  if (prop.dateTestPratique === prop.datePratique) {
    assert.ok(prop.debutTestPratique >= prop.debutPratique + 210,
      'le même jour, l’épreuve vient après la formation');
  }
});

test('épreuve surveillée : elle EST l’examen — pas de test théorique à côté', () => {
  // L'AIPR se sanctionne par son seul QCM. Réclamer en plus un test théorique
  // posait une anomalie sur toute ligne « formation + épreuve » et envoyait
  // chercher un créneau de testeur à 11:00 qui n'a pas lieu d'exister.
  const s = etat();
  s.inscriptions = [ligne({ dateTestPratique: J, debutTestPratique: 840 })];
  const row = computeSchedule(s).rows[0];
  assert.deepEqual(row.errors, [], `obtenu : ${row.errors.join(' | ')}`);

  // L'épreuve, elle, reste obligatoire — et se nomme par son nom.
  const t = etat();
  t.inscriptions = [ligne()];
  assert.deepEqual(computeSchedule(t).rows[0].errors, ['Épreuve manquante']);

  // Une R489 continue d'exiger les deux.
  const u = etat();
  u.inscriptions = [ligne({ formation: 'R489-1A' })];
  assert.deepEqual(computeSchedule(u).rows[0].errors,
    ['Test pratique manquant', 'Test théorique R489 manquant']);
});

test('modalité « épreuve seule » : rien n’a changé pour elle', () => {
  const s = etat();
  s.inscriptions = [ligne({ formation: 'AIPR', debutPratique: 480 })];
  const row = computeSchedule(s).rows[0];
  assert.deepEqual(row.errors, []);
  assert.equal(row.finPratique, 600, '08:00 + 2h00');
  assert.ok(!testSurveille(row.formation), 'l’épreuve seule n’est pas « le test » d’une formation');
  // Surveillance : toujours hors occupation.
  assert.equal(occupancyByDay(s, computeSchedule(s)).get(J).busy, 0);
});

// --- Reprise d'un état enregistré avant ces champs -------------------------

test('reprise : un catalogue ancien reçoit la seconde modalité sans perdre ses réglages', () => {
  const ancien = {
    version: 1,
    formations: [
      { code: 'R489-1A', label: 'Pratique R489 Cat 1A', reco: 'R489', dureeInitial: 90, dureeRecyclage: 60, tests: true, capacite: 1 },
      { code: 'MAISON', label: 'Formation maison', reco: 'MAISON', dureeInitial: 120, dureeRecyclage: 120, tests: true, capacite: 3 },
    ],
    team: [], openDays: [], inscriptions: [], params: {},
  };
  const s = migrate(ancien);

  // La nouvelle modalité arrive dans le catalogue…
  assert.ok(formationByCode(s.formations, 'AIPR-FORM'), 'AIPR-FORM injectée');
  // …et la formation personnalisée garde la sienne, avec des champs normalisés.
  const maison = formationByCode(s.formations, 'MAISON');
  assert.equal(maison.capacite, 3);
  assert.equal(maison.dureeTest, null, 'vide et non 0 : « prendre la durée générale »');
  assert.equal(maison.testSurveille, false);
  assert.equal(dureeTestFor(maison, s.params), s.params.practicalTestDuration);

  // Un 0 ou une chaîne traînant dans un état importé est ramené à null.
  const bruit = migrate({
    version: 1,
    formations: [{ code: 'X', label: 'X', reco: 'X', dureeInitial: 60, dureeRecyclage: 60, tests: true, capacite: 1, dureeTest: 0 }],
    team: [], openDays: [], inscriptions: [], params: {},
  });
  assert.equal(formationByCode(bruit.formations, 'X').dureeTest, null);
});
