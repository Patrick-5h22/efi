// Les zones d'évolution vues par le MOTEUR : affectation, capacité, matériel
// partagé et règle de pôle.
//
// Le paramétrage lui-même est couvert par sites-zones.test.mjs. Ici on vérifie
// ce qui en DÉCOULE — et c'est le cœur de la spécification : les deux
// « règles » du courriel d'Emmanuel ne sont écrites nulle part dans le code,
// elles tombent du modèle « une zone, N sessions ».

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, addInscription } from '../js/store.js';
import { computeSchedule, suggestSlots } from '../js/engine.js';

const J = '2026-09-21'; // lundi
const K = '2026-09-22';

const QUALS = Object.fromEntries(
  ['R489-1A', 'R489-1B', 'R489-3', 'R489-5', 'R485-1', 'R485-2', 'R486-A', 'HAB-ELEC', 'AIPR', 'AIPR-FORM']
    .map((c) => [c, { F: true, T: true }]));

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

const pose = (s, over) => addInscription(s, {
  stagiaire: 'CANDIDAT Un', formation: 'R489-3', type: 'Initial',
  statut: 'confirmee', modeTheorie: 'distance',
  datePratique: J, debutPratique: 480, dateTheorie: J,
  dateTestPratique: J, debutTestPratique: 600,
  ...over,
});

const lignes = (s) => computeSchedule(s).rows;
const erreurs = (s) => lignes(s).flatMap((r) => r.errors);

// Ce fichier ne parle que de plateaux. Les fixtures laissent volontairement
// des tests ou des théories non posés — « Test pratique manquant » est alors
// une anomalie juste, et sans rapport avec ce qu'on vérifie ici.
const PLATEAU = /zone|plateau|Porte-engin|trop éloignés|n’accueille/i;
const anomaliesDePlateau = (r) => r.errors.filter((e) => PLATEAU.test(e));

// --- Affectation automatique ----------------------------------------------

test('zone : chaque séance reçoit un plateau, sans rien demander', () => {
  const s = etat();
  pose(s, {});
  const [r] = lignes(s);
  assert.deepEqual(r.errors, [], r.errors.join(' | '));
  assert.ok(r.zonePratique, 'la formation a un plateau');
  assert.ok(r.zoneTest, 'le test aussi');
  assert.ok(['z-35-1', 'z-35-2'].includes(r.zonePratique), r.zonePratique);
});

test('zone : un plateau imposé est respecté', () => {
  const s = etat();
  pose(s, { zoneId: 'z-35-2', zoneTestId: 'z-35-1' });
  const [r] = lignes(s);
  assert.deepEqual(r.errors, [], r.errors.join(' | '));
  assert.equal(r.zonePratique, 'z-35-2');
  assert.equal(r.zoneTest, 'z-35-1');
});

test('zone : un plateau imposé qui n’accueille pas le dispositif est refusé', () => {
  const s = etat();
  pose(s, { zoneId: 'z-r486' });
  const e = lignes(s)[0].errors;
  assert.ok(e.some((x) => /n’accueille pas/.test(x)), e.join(' | '));
  // Et le refus ne se rattrape pas en silence sur un autre plateau : la ligne
  // reste sans zone, ce qui se voit.
  assert.equal(lignes(s)[0].zonePratique, null);
});

test('zone : une zone inconnue est signalée, pas ignorée', () => {
  const s = etat();
  pose(s, { zoneId: 'z-fantome' });
  assert.ok(erreurs(s).some((x) => /zone inconnue/.test(x)), erreurs(s).join(' | '));
});

// --- Ce qui découle du modèle ---------------------------------------------

test('zone : deux plateaux Cat 3/5 en parallèle — la 3e séance ne passe pas', () => {
  const s = etat();
  // Trois formations Cat 3 sur le même créneau, avec trois formateurs.
  pose(s, { stagiaire: 'UN', formateurId: 'p1', dateTestPratique: null, debutTestPratique: null });
  pose(s, { stagiaire: 'DEUX', formateurId: 'p2', dateTheorie: null, dateTestPratique: null, debutTestPratique: null });
  pose(s, { stagiaire: 'TROIS', formateurId: 'p3', dateTheorie: null, dateTestPratique: null, debutTestPratique: null });
  const rows = lignes(s);

  // Les deux premières tiennent, chacune sur son plateau…
  assert.ok(!rows[0].errors.some((e) => /zone/i.test(e)), rows[0].errors.join(' | '));
  assert.ok(!rows[1].errors.some((e) => /zone/i.test(e)), rows[1].errors.join(' | '));
  assert.notEqual(rows[0].zonePratique, rows[1].zonePratique, 'deux plateaux distincts');

  // …la troisième non : il n'y a que deux plateaux Cat 3/5.
  assert.ok(rows[2].errors.some((e) => /toutes les zones/.test(e)), rows[2].errors.join(' | '));
  assert.equal(rows[2].zonePratique, null);
});

test('zone : la capacité du dispositif n’est pas la capacité du plateau', () => {
  const s = etat();
  // R489 Cat 3 : capacité 2 (deux chariots). Deux candidats, MÊME formateur,
  // MÊME créneau : une seule séance, donc une seule session de plateau.
  pose(s, { stagiaire: 'UN', formateurId: 'p1', dateTestPratique: null, debutTestPratique: null });
  pose(s, { stagiaire: 'DEUX', formateurId: 'p1', dateTheorie: null, dateTestPratique: null, debutTestPratique: null });
  const rows = lignes(s);
  for (const r of rows) assert.deepEqual(anomaliesDePlateau(r), [], r.errors.join(' | '));
  assert.equal(rows[0].zonePratique, rows[1].zonePratique, 'un seul plateau pour la séance');
});

test('zone : la mutualisation R485 / R489 1A-1B n’est écrite nulle part — elle découle', () => {
  const s = etat();
  // Aucune règle « R485 et R489 1A jamais ensemble » n'existe dans le code.
  // C'est la zone unique qui l'impose.
  pose(s, {
    stagiaire: 'UN', formation: 'R489-1A', formateurId: 'p1',
    dateTestPratique: null, debutTestPratique: null,
  });
  pose(s, {
    stagiaire: 'DEUX', formation: 'R485-1', formateurId: 'p2', dateTheorie: null,
    dateTestPratique: null, debutTestPratique: null,
  });
  const rows = lignes(s);
  assert.equal(rows[0].zonePratique, 'z-mutu');
  assert.ok(rows[1].errors.some((e) => /toutes les zones/.test(e)),
    `la R485 devrait buter sur la zone mutualisée : ${rows[1].errors.join(' | ')}`);
});

test('zone : décalées dans la journée, les deux séances cohabitent', () => {
  const s = etat();
  pose(s, {
    stagiaire: 'UN', formation: 'R489-1A', formateurId: 'p1', debutPratique: 480,
    dateTestPratique: null, debutTestPratique: null,
  });
  pose(s, {
    stagiaire: 'DEUX', formation: 'R485-1', formateurId: 'p2', debutPratique: 600, dateTheorie: null,
    dateTestPratique: null, debutTestPratique: null,
  });
  for (const r of lignes(s)) assert.deepEqual(anomaliesDePlateau(r), [], r.errors.join(' | '));
});

// --- Le matériel partagé --------------------------------------------------

test('matériel partagé : un exemplaire, une séance à la fois', () => {
  const s = etat();
  // La R482 n'est pas au catalogue : on la crée ici pour éprouver le
  // porte-engin, qui l'attend. Deux zones R482 existent déjà à Périgny II,
  // et elles admettent la recommandation entière.
  s.formations.push(
    { code: 'R482-A', label: 'Pratique R482 Cat A', reco: 'R482', dureeInitial: 90, dureeRecyclage: 60, tests: false, capacite: 1, testOnly: false, chargeComptee: true, dureeTest: null, testSurveille: false },
    { code: 'R482-F', label: 'Pratique R482 Cat F', reco: 'R482', dureeInitial: 90, dureeRecyclage: 60, tests: false, capacite: 1, testOnly: false, chargeComptee: true, dureeTest: null, testSurveille: false },
    { code: 'R482-B1', label: 'Pratique R482 Cat B1', reco: 'R482', dureeInitial: 90, dureeRecyclage: 60, tests: false, capacite: 1, testOnly: false, chargeComptee: true, dureeTest: null, testSurveille: false },
  );
  for (const m of s.team) for (const c of ['R482-A', 'R482-F', 'R482-B1']) m.quals[c] = { F: true, T: true };

  // Cat A et Cat F en même temps : deux zones libres, mais UN porte-engin.
  pose(s, { stagiaire: 'UN', formation: 'R482-A', formateurId: 'p1', dateTheorie: null, dateTestPratique: null, debutTestPratique: null });
  pose(s, { stagiaire: 'DEUX', formation: 'R482-F', formateurId: 'p2', dateTheorie: null, dateTestPratique: null, debutTestPratique: null });
  const rows = lignes(s);
  assert.equal(rows[0].zonePratique, 'z-r482-1');
  assert.equal(rows[1].zonePratique, 'z-r482-2', 'la seconde trouve bien un plateau libre…');
  assert.ok(rows[1].errors.some((e) => /Porte-engin déjà utilisé/.test(e)),
    `…mais pas le porte-engin : ${rows[1].errors.join(' | ')}`);

  // Une catégorie qui ne le requiert pas n'est pas gênée.
  const t = etat();
  t.formations = s.formations;
  t.team = s.team;
  pose(t, { stagiaire: 'UN', formation: 'R482-A', formateurId: 'p1', dateTheorie: null, dateTestPratique: null, debutTestPratique: null });
  pose(t, { stagiaire: 'DEUX', formation: 'R482-B1', formateurId: 'p2', dateTheorie: null, dateTestPratique: null, debutTestPratique: null });
  for (const r of lignes(t)) {
    assert.ok(!r.errors.some((e) => /Porte-engin/.test(e)), r.errors.join(' | '));
  }
});

// --- La règle de pôle -----------------------------------------------------

test('pôle : Périgny et Saintes ne s’enchaînent pas dans la journée', () => {
  const s = etat();
  // L'habilitation électrique se tient sur les deux sites. On impose les
  // plateaux pour fabriquer le cas — l'affectation automatique, elle, refuse
  // de le créer (test suivant).
  pose(s, {
    stagiaire: 'UN', formation: 'HAB-ELEC', formateurId: 'p1', zoneId: 'z-elec-p',
    dateTheorie: null, dateTestPratique: null, debutTestPratique: null,
  });
  pose(s, {
    stagiaire: 'UN', formation: 'HAB-ELEC', formateurId: 'p1', zoneId: 'z-elec-s',
    debutPratique: 720, dateTheorie: null, dateTestPratique: null, debutTestPratique: null,
  });
  const rows = lignes(s);
  const message = /deux sites trop éloignés le même jour/;
  // Le stagiaire ET le formateur sont concernés : ni l'un ni l'autre ne peut
  // faire la route.
  assert.ok(rows[0].errors.some((e) => message.test(e) && /CANDIDAT|UN/.test(e)),
    rows[0].errors.join(' | '));
  assert.ok(rows[0].errors.some((e) => message.test(e) && /MEDAN/.test(e)),
    rows[0].errors.join(' | '));
  // L'anomalie porte sur les DEUX lignes : c'est la journée qui ne tient pas,
  // pas l'une des deux séances.
  assert.ok(rows[1].errors.some((e) => message.test(e)), rows[1].errors.join(' | '));
  assert.ok(rows[0].errors.some((e) => /Périgny et Saintes/.test(e)), rows[0].errors.join(' | '));
});

test('pôle : Périgny et Périgny II s’enchaînent, eux', () => {
  const s = etat();
  s.formations.push({ code: 'R482-A', label: 'Pratique R482 Cat A', reco: 'R482', dureeInitial: 90, dureeRecyclage: 60, tests: false, capacite: 1, testOnly: false, chargeComptee: true, dureeTest: null, testSurveille: false });
  for (const m of s.team) m.quals['R482-A'] = { F: true, T: true };
  pose(s, {
    stagiaire: 'UN', formation: 'HAB-ELEC', formateurId: 'p1',
    dateTheorie: null, dateTestPratique: null, debutTestPratique: null,
  });
  pose(s, {
    stagiaire: 'UN', formation: 'R482-A', formateurId: 'p1', debutPratique: 720,
    dateTheorie: null, dateTestPratique: null, debutTestPratique: null,
  });
  for (const r of lignes(s)) {
    assert.ok(!r.errors.some((e) => /trop éloignés/.test(e)), r.errors.join(' | '));
  }
});

test('pôle : l’affectation automatique ne fabrique pas le déplacement', () => {
  const s = etat();
  // Deux épreuves AIPR surveillées le même jour par la même personne : la
  // zone AIPR de Périgny et celle de Saintes accueillent toutes deux le
  // dispositif. Envoyer la seconde à Saintes serait absurde.
  pose(s, {
    stagiaire: 'UN', formation: 'AIPR', testeurId: 'p1', debutPratique: 480,
    dateTheorie: null, dateTestPratique: null, debutTestPratique: null,
  });
  pose(s, {
    stagiaire: 'DEUX', formation: 'AIPR', testeurId: 'p1', debutPratique: 510,
    dateTheorie: null, dateTestPratique: null, debutTestPratique: null,
  });
  const rows = lignes(s);
  for (const r of rows) assert.deepEqual(r.errors, [], r.errors.join(' | '));
  assert.equal(rows[0].zonePratique, rows[1].zonePratique, 'les deux restent au même endroit');
});

// --- Ce que le moteur propose ---------------------------------------------

test('proposition : une zone occupée pousse la suggestion ailleurs', () => {
  const s = etat();
  // Les deux plateaux Cat 3/5 pris toute la matinée par d'autres formateurs.
  pose(s, { stagiaire: 'A', formateurId: 'p1', zoneId: 'z-35-1', dateTheorie: null, dateTestPratique: null, debutTestPratique: null });
  pose(s, { stagiaire: 'B', formateurId: 'p2', zoneId: 'z-35-2', dateTheorie: null, dateTestPratique: null, debutTestPratique: null });

  const prop = suggestSlots(s, {
    stagiaire: 'CANDIDAT Neuf', formation: 'R489-3', type: 'Initial', aujourdHui: J,
  });
  assert.ok(prop, 'une proposition reste possible');
  // Elle ne peut pas chevaucher les deux séances de 08:00–09:30.
  const chevauche = prop.datePratique === J && prop.debutPratique < 570 && prop.debutPratique + 90 > 480;
  assert.ok(!chevauche, `proposition sur un plateau déjà pris : ${JSON.stringify(prop)}`);
});

// --- Sans zones déclarées -------------------------------------------------

test('sans zone déclarée, rien ne change', () => {
  // Un planning d'avant les sites doit continuer à fonctionner à l'identique :
  // pas de modèle, pas de contrainte. Ajouter une contrainte à un état qui
  // n'en porte pas les données ferait basculer tout le planning en anomalie.
  const s = etat();
  s.zones = [];
  s.sites = [];
  s.ressources = [];
  pose(s, { stagiaire: 'UN', formateurId: 'p1', dateTestPratique: null, debutTestPratique: null });
  pose(s, { stagiaire: 'DEUX', formateurId: 'p2', dateTheorie: null, dateTestPratique: null, debutTestPratique: null });
  pose(s, { stagiaire: 'TROIS', formateurId: 'p3', dateTheorie: null, dateTestPratique: null, debutTestPratique: null });
  const rows = lignes(s);
  for (const r of rows) {
    assert.deepEqual(anomaliesDePlateau(r), [], r.errors.join(' | '));
    assert.equal(r.zonePratique, null);
  }
});
