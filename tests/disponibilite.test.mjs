// Fenêtre de disponibilité des intervenants.
//
// Demande d'Emmanuel Neau (18/09/2026) : « Actuellement, un formateur inscrit
// dans l'outil est considéré disponible sur toute la période, dès lors qu'il
// est habilité. Il faut ajouter une véritable gestion de disponibilité […] de
// sorte qu'une nouvelle ressource puisse être ajoutée avec une disponibilité
// limitée dans le planning, plutôt que disponible par défaut. »
//
// Deux filtres se cumulent désormais, et l'ordre compte :
//   1. la FENÊTRE de l'intervenant (son défaut, réglé sur sa fiche) ;
//   2. la PRÉSENCE du jour (page Jours EFI), qui garde le dernier mot DANS
//      la fenêtre.
// Cocher « présent » hors de la fenêtre ne rend pas quelqu'un disponible : une
// personne recrutée en novembre n'est pas disponible en septembre parce qu'on
// a coché une case.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, addInscription, migrate } from '../js/store.js';
import { computeSchedule, memberAvailability } from '../js/engine.js';
import { dansLaFenetre, libelleFenetre } from '../js/config.js';

const J = '2026-09-21'; // lundi

function etat() {
  const s = defaultState();
  s.openDays = [J, '2026-09-22'];
  s.inscriptions = [];
  return s;
}

const ligne = (over = {}) => ({
  stagiaire: 'CANDIDAT Un', formation: 'R489-1A', type: 'Initial',
  datePratique: J, debutPratique: 480, ...over,
});

// --- Le prédicat lui-même -------------------------------------------------

test('fenêtre : bornes optionnelles et incluses', () => {
  assert.ok(dansLaFenetre({}, J), 'aucune borne = sans limite');
  assert.ok(dansLaFenetre({ dispoDebut: null, dispoFin: null }, J));

  assert.ok(dansLaFenetre({ dispoDebut: J }, J), 'la borne de début est incluse');
  assert.ok(dansLaFenetre({ dispoFin: J }, J), 'la borne de fin est incluse');

  assert.ok(!dansLaFenetre({ dispoDebut: '2026-09-22' }, J), 'avant le début');
  assert.ok(!dansLaFenetre({ dispoFin: '2026-09-20' }, J), 'après la fin');

  assert.ok(dansLaFenetre({ dispoDebut: '2026-09-01', dispoFin: '2026-12-31' }, J));
  assert.ok(!dansLaFenetre({ dispoDebut: '2026-10-01', dispoFin: '2026-12-31' }, J));

  assert.ok(!dansLaFenetre(null, J), 'membre inconnu : pas disponible');
  assert.ok(!dansLaFenetre({}, null), 'date absente : rien à juger');
});

test('fenêtre : libellé lisible dans les messages', () => {
  assert.equal(libelleFenetre({}), 'sans limite');
  assert.equal(libelleFenetre({ dispoDebut: '2026-11-03' }), 'à partir du 2026-11-03');
  assert.equal(libelleFenetre({ dispoFin: '2026-12-31' }), 'jusqu’au 2026-12-31');
  assert.equal(libelleFenetre({ dispoDebut: '2026-11-03', dispoFin: '2026-12-31' }),
    'du 2026-11-03 au 2026-12-31');
});

// --- Affectation automatique ----------------------------------------------

test('affectation auto : un intervenant hors fenêtre n’est pas retenu', () => {
  const state = etat();
  // p1 arrive en novembre : seul p2 peut former le 21/09.
  state.team[0].dispoDebut = '2026-11-01';
  addInscription(state, ligne());
  const { rows } = computeSchedule(state);
  assert.equal(rows[0].formateurEffectif, 'p2',
    `retenu : ${rows[0].formateurEffectif} — p1 n’est disponible qu’à partir du 01/11`);
});

test('affectation auto : plus personne dans la fenêtre → aucun formateur', () => {
  const state = etat();
  for (const m of state.team) m.dispoDebut = '2026-11-01';
  addInscription(state, ligne());
  const { rows } = computeSchedule(state);
  assert.equal(rows[0].formateurEffectif, null);
  assert.ok(rows[0].errors.some((e) => e.includes('Aucun formateur disponible')),
    rows[0].errors.join(' ; '));
});

// --- Affectation MANUELLE : c'est là qu'il faut un message -----------------

test('affectation manuelle hors fenêtre : anomalie qui dit pourquoi', () => {
  const state = etat();
  state.team[0].dispoDebut = '2026-11-01';
  addInscription(state, ligne({ formateurId: 'p1' }));
  const { rows } = computeSchedule(state);

  const dit = rows[0].errors.join(' ; ');
  assert.ok(/hors de sa période de disponibilité/.test(dit), dit);
  assert.ok(/à partir du 2026-11-01/.test(dit), 'le message donne la fenêtre — ' + dit);
  assert.ok(!/non présent ce jour/.test(dit),
    'ne pas envoyer corriger la case du jour : ce n’est pas la cause — ' + dit);
});

// Les deux causes sont distinctes et appellent des corrections différentes :
// « coche la case du jour » et « cette personne n'est pas dans l'équipe sur
// cette période » ne se règlent pas au même endroit.
test('absence ponctuelle dans la fenêtre : l’autre message', () => {
  const state = etat();
  state.team[0].dispoDebut = '2026-09-01';
  state.team[0].dispoFin = '2026-12-31';
  state.dayPresence = { [J]: ['p2'] }; // p1 dans sa fenêtre, mais absent ce jour
  addInscription(state, ligne({ formateurId: 'p1' }));
  const { rows } = computeSchedule(state);

  const dit = rows[0].errors.join(' ; ');
  assert.ok(/non présent ce jour/.test(dit), dit);
  assert.ok(!/hors de sa période/.test(dit), dit);
});

test('cocher « présent » hors fenêtre ne rend pas disponible', () => {
  const state = etat();
  state.team[0].dispoDebut = '2026-11-01';
  state.dayPresence = { [J]: ['p1'] }; // coché présent… mais hors fenêtre
  addInscription(state, ligne({ formateurId: 'p1' }));
  const { rows } = computeSchedule(state);
  assert.ok(rows[0].errors.some((e) => e.includes('hors de sa période de disponibilité')),
    rows[0].errors.join(' ; '));
});

// --- Écran de disponibilités de la saisie ---------------------------------

test('disponibilités affichées : hors fenêtre = absent', () => {
  const state = etat();
  state.team[0].dispoDebut = '2026-11-01';
  const avail = memberAvailability(state, {
    formation: 'R489-1A', type: 'Initial', datePratique: J, debutPratique: 480,
  });
  const p1 = avail.find((a) => a.id === 'p1');
  assert.ok(p1, 'p1 doit figurer dans la liste');
  assert.equal(p1.F, 'absent', `p1 est ${p1.F} alors qu’il arrive le 01/11`);
  const p2 = avail.find((a) => a.id === 'p2');
  assert.equal(p2.F, 'libre');
});

// --- Reprise des états déjà enregistrés -----------------------------------

// Les états déjà enregistrés n'ont pas de fenêtre : l'absence de bornes doit
// reproduire exactement le comportement d'avant, sans anomalie nouvelle.
// (La ligne minimale porte ses propres anomalies — test pratique et théorie
// non posés ; on vise la disponibilité, pas la complétude du dossier.)
test('migration : une équipe sans fenêtre reste disponible sans limite', () => {
  const state = etat();
  delete state.team[0].dispoDebut;
  delete state.team[0].dispoFin;
  addInscription(state, ligne({ formateurId: 'p1' }));
  const { rows } = computeSchedule(state);

  const dispo = rows[0].errors.filter((e) => /disponibilité|non présent/.test(e));
  assert.deepEqual(dispo, [], dispo.join(' ; '));
  assert.equal(rows[0].formateurEffectif, 'p1');
});

// Une borne vidée dans l'écran Équipe doit repartir en NULL vers la base, pas
// en chaîne vide : une comparaison de dates sur '' donnerait n'importe quoi.
test('migration : les bornes vides sont normalisées en null', () => {
  const brut = {
    ...defaultState(),
    team: [
      { id: 'p1', name: 'A', quals: {}, dispoDebut: '', dispoFin: '' },
      { id: 'p2', name: 'B', quals: {} },
    ],
  };
  const apres = migrate(structuredClone(brut));
  for (const m of apres.team) {
    assert.equal(m.dispoDebut, null, `${m.name} : début`);
    assert.equal(m.dispoFin, null, `${m.name} : fin`);
  }
  assert.ok(dansLaFenetre(apres.team[0], J), 'et l’intervenant reste disponible');
});
