// La journée R482 est à horaires IMPOSÉS.
//
//   « Créneaux imposés, il faut conserver :
//     8h00-11h00 formation pratique
//     11h00-12h00 test théorique
//     13h00-16h00 : tests pratiques »     — Benoit, 09/10/2026
//
// Le moteur plaçait jusqu'ici librement dans la journée, et c'était le bon
// comportement pour tout le reste du catalogue : une R489 Cat 3 se pose où il
// reste de la place. La contrainte est donc déclarée PAR DISPOSITIF
// (debutImpose, debutTestsImpose) plutôt qu'écrite en dur pour la R482 —
// elle vient de l'organisation du plateau, et c'est là qu'elle se corrige.
//
// Deux sémantiques distinctes, et c'est volontaire :
//
//   debutImpose        la formation commence À cette heure, pas une autre ;
//   debutTestsImpose   les tests ne commencent PAS AVANT cette heure, puis
//                      s'enchaînent candidat par candidat.
//
// Les confondre donnerait l'un de deux défauts : soit le deuxième candidat
// serait refusé parce qu'il passe à 14h00 et non à 13h00, soit la formation
// pourrait glisser à 09h00 sans que rien ne le dise.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, addInscription, migrate } from '../js/store.js';
import { PERSISTED_FIELDS, pickPersisted } from '../js/persisted.js';
import { computeSchedule, suggestSlots, suggestTestPratique } from '../js/engine.js';
import { formationByCode, debutImposeDe, debutTestsImposeDe } from '../js/config.js';

const J = '2026-09-21'; // lundi
const K = '2026-09-22';

const CODES = ['R482-A', 'R482-B1', 'R482-C1', 'R482-F', 'R489-3'];
const QUALS = Object.fromEntries(CODES.map((c) => [c, { F: true, T: true }]));

function etat() {
  const s = defaultState();
  s.team = [
    { id: 'p1', name: 'MEDAN Dominique', quals: structuredClone(QUALS) },
    { id: 'p2', name: 'GARCIA Thierry', quals: structuredClone(QUALS) },
    { id: 'p3', name: 'LEROY Sophie', quals: structuredClone(QUALS) },
  ];
  s.openDays = [J, K];
  s.dayPresence = {};
  s.inscriptions = [];
  s.nextId = 1;
  return s;
}

const HORAIRE = /créneau imposé/;
const imposes = (r) => r.errors.filter((e) => HORAIRE.test(e));

// --- Le catalogue ---------------------------------------------------------

test('catalogue : les quatre catégories R482 portent les mêmes horaires', () => {
  const s = etat();
  for (const code of ['R482-A', 'R482-B1', 'R482-C1', 'R482-F']) {
    const f = formationByCode(s.formations, code);
    assert.equal(debutImposeDe(f), 480, `${code} : formation à 08h00`);
    assert.equal(debutTestsImposeDe(f), 780, `${code} : tests à partir de 13h00`);
  }
});

test('catalogue : le reste du catalogue reste libre', () => {
  // Le point qui compte : imposer la R482 ne doit pas imposer le reste.
  const s = etat();
  for (const f of s.formations.filter((x) => x.reco !== 'R482')) {
    assert.equal(debutImposeDe(f), null, f.code);
    assert.equal(debutTestsImposeDe(f), null, f.code);
  }
});

// --- Ce que le moteur propose ---------------------------------------------

test('proposition : la formation R482 tombe à 08h00, et nulle part ailleurs', () => {
  const s = etat();
  const prop = suggestSlots(s, {
    stagiaire: 'CANDIDAT Un', formation: 'R482-B1', type: 'Initial', aujourdHui: J,
  });
  assert.ok(prop, 'une proposition existe');
  assert.equal(prop.debutPratique, 480);
  assert.ok(prop.debutTestPratique >= 780,
    `test à ${prop.debutTestPratique}, attendu ≥ 780 (13h00)`);
});

test('proposition : une R489 continue de se placer librement', () => {
  // Contre-épreuve. Sans elle, on ne saurait pas si la proposition tombe à
  // 08h00 parce qu'elle est imposée ou parce que c'est le premier créneau.
  const s = etat();
  addInscription(s, {
    stagiaire: 'OCCUPE Un', formation: 'R489-3', type: 'Initial', formateurId: 'p1',
    datePratique: J, debutPratique: 480, dateTheorie: J,
    dateTestPratique: J, debutTestPratique: 660,
  });
  const prop = suggestSlots(s, {
    stagiaire: 'CANDIDAT Deux', formation: 'R489-3', type: 'Initial', aujourdHui: J,
  });
  assert.ok(prop, 'une proposition existe');
  assert.notEqual(prop.debutPratique, null);
  // Elle n'est pas tenue à 08h00 : le moteur a toute la journée.
  assert.ok(prop.debutPratique >= 480 && prop.debutPratique < 1080, String(prop.debutPratique));
});

test('proposition : le créneau de 08h00 pris, la R482 passe au lendemain', () => {
  // Conséquence directe de l'horaire imposé, et elle est VOULUE : une seule
  // session de 08h00 par plateau et par jour. Deux plateaux à Périgny II,
  // donc deux sessions — la troisième attend demain.
  const s = etat();
  for (const [n, who] of [['UN', 'p1'], ['DEUX', 'p2']]) {
    addInscription(s, {
      stagiaire: `PRIS ${n}`, formation: 'R482-B1', type: 'Initial', formateurId: who,
      datePratique: J, debutPratique: 480, dateTheorie: J,
      dateTestPratique: J, debutTestPratique: 780,
    });
  }
  const prop = suggestSlots(s, {
    stagiaire: 'CANDIDAT Trois', formation: 'R482-F', type: 'Initial', aujourdHui: J,
  });
  assert.ok(prop, 'une proposition existe tout de même');
  assert.equal(prop.debutPratique, 480, 'toujours 08h00…');
  assert.equal(prop.datePratique, K, '…mais le lendemain');
});

test('proposition de test seul : jamais avant 13h00', () => {
  const s = etat();
  const id = addInscription(s, {
    stagiaire: 'CANDIDAT Un', formation: 'R482-B1', type: 'Initial', formateurId: 'p1',
    datePratique: J, debutPratique: 480, dateTheorie: J,
  }).id;
  const prop = suggestTestPratique(s, id, { aujourdHui: J });
  assert.ok(prop, 'un test est proposé');
  assert.ok(prop.debutTestPratique >= 780,
    `test à ${prop.debutTestPratique}, attendu ≥ 780`);
});

// --- Ce que le moteur refuse ----------------------------------------------

test('anomalie : une formation R482 ailleurs qu’à 08h00 est signalée', () => {
  const s = etat();
  addInscription(s, {
    stagiaire: 'CANDIDAT Un', formation: 'R482-B1', type: 'Initial', formateurId: 'p1',
    datePratique: J, debutPratique: 540, dateTheorie: J, // 09h00
    dateTestPratique: J, debutTestPratique: 780,
  });
  const [r] = computeSchedule(s).rows;
  assert.ok(r.errors.some((e) => /créneau imposé — 08:00/.test(e)),
    r.errors.join(' | '));
});

test('anomalie : un test R482 avant 13h00 est signalé', () => {
  const s = etat();
  addInscription(s, {
    stagiaire: 'CANDIDAT Un', formation: 'R482-B1', type: 'Initial', formateurId: 'p1',
    datePratique: J, debutPratique: 480, dateTheorie: J,
    dateTestPratique: J, debutTestPratique: 720, // 12h00
  });
  const [r] = computeSchedule(s).rows;
  assert.ok(r.errors.some((e) => /Test pratique : créneau imposé — à partir de 13:00/.test(e)),
    r.errors.join(' | '));
});

test('…mais un test APRÈS 13h00 passe, car les candidats s’enchaînent', () => {
  // Le deuxième candidat passe à 14h00 et le troisième à 15h00 : exiger
  // 13h00 pile les refuserait tous les deux. C'est pourquoi les deux réglages
  // n'ont pas la même sémantique.
  const s = etat();
  const heures = [780, 840, 900]; // 13h, 14h, 15h
  heures.forEach((h, k) => addInscription(s, {
    stagiaire: `CANDIDAT ${k + 1}`, formation: 'R482-B1', type: 'Initial', formateurId: 'p1',
    datePratique: J, debutPratique: 480, dateTheorie: J,
    dateTestPratique: J, debutTestPratique: h,
  }));
  for (const r of computeSchedule(s).rows) {
    assert.deepEqual(imposes(r), [], `${r.insc.stagiaire} : ${r.errors.join(' | ')}`);
  }
});

test('la Cat A tient jusqu’à 17h30 sans que l’horaire imposé s’y oppose', () => {
  // 1h30 par candidat : 13h00, 14h30, 16h00 — le dernier finit à 17h30.
  const s = etat();
  [780, 870, 960].forEach((h, k) => addInscription(s, {
    stagiaire: `CANDIDAT ${k + 1}`, formation: 'R482-A', type: 'Initial', formateurId: 'p1',
    datePratique: J, debutPratique: 480, dateTheorie: J,
    dateTestPratique: J, debutTestPratique: h,
  }));
  const rows = computeSchedule(s).rows;
  for (const r of rows) assert.deepEqual(imposes(r), [], r.errors.join(' | '));
  assert.equal(rows[2].finTestPratique, 1050, 'le troisième finit à 17h30');
});

test('une formation sans horaire imposé n’est jamais signalée', () => {
  const s = etat();
  addInscription(s, {
    stagiaire: 'CANDIDAT Un', formation: 'R489-3', type: 'Initial', formateurId: 'p1',
    datePratique: J, debutPratique: 600, dateTheorie: J, // 10h00, parfaitement valide
    dateTestPratique: J, debutTestPratique: 840,
  });
  const [r] = computeSchedule(s).rows;
  assert.deepEqual(imposes(r), [], r.errors.join(' | '));
});

// ── La reprise ────────────────────────────────────────────────────────────
//
// Déclarer la contrainte dans le catalogue livré ne suffit pas : l'état de
// production existe DÉJÀ, ses quatre lignes R482 sont enregistrées, et rien
// n'allait jamais y poser 480 et 780. La migration 012 crée les colonnes ;
// elle ne remplit rien. Sans reprise, tout ce qui précède est inerte en
// production — vérifié le 14/10/2026 : cinq contrôles de structure au vert et
// quatre « debut_impose » à null.
//
// Le cas qui compte est celui d'un état venu de Supabase APRÈS la 012 : la
// RPC y rend « debutImpose: null » explicitement. C'est pourquoi la reprise
// ne peut pas se fier à l'absence du champ.

test('un état enregistré avant les horaires imposés les reçoit', () => {
  const s = defaultState();
  // Ce que rend efi_load_state après la 012 : la clé existe, elle est nulle.
  for (const f of s.formations) { f.debutImpose = null; f.debutTestsImpose = null; }
  for (const r of s.ressources) r.exclusifJour = false;
  delete s.params.reprises;

  const repris = migrate(s);
  const catA = formationByCode(repris.formations, 'R482-A');
  assert.equal(catA.debutImpose, 480, 'la formation Cat A reprend son 8h00');
  assert.equal(catA.debutTestsImpose, 780, 'ses tests reprennent leur 13h00');
  assert.equal(repris.ressources.find((r) => r.id === 'porte-engin').exclusifJour, true,
    'le porte-engin reprend son exclusivité — aucune case ne permet de la poser à la main');
});

test('une valeur effacée à la main n’est pas ressuscitée', () => {
  // La distinction qui justifie le marqueur. Premier passage : la reprise a
  // lieu. L'utilisateur vide ensuite le champ dans Paramètres. Deuxième
  // passage : il doit rester vide, sinon Paramètres ne sert à rien.
  const s = migrate(defaultState());
  assert.ok(s.params.reprises.includes('horaires-imposes'), 'la reprise est consignée');

  formationByCode(s.formations, 'R482-A').debutImpose = null;
  const relu = migrate(structuredClone(s));
  assert.equal(formationByCode(relu.formations, 'R482-A').debutImpose, null,
    'le choix de l’utilisateur survit au rechargement');
});

test('le marqueur voyage jusqu’à la base', () => {
  // Il vit dans params, qui part dans le jsonb de planning.params. S'il n'y
  // était pas retenu, la reprise se rejouerait à chaque chargement et
  // l'assertion précédente serait fausse en production.
  const s = migrate(defaultState());
  assert.ok(PERSISTED_FIELDS.includes('params'));
  assert.ok(pickPersisted(s).params.reprises.includes('horaires-imposes'));
});
