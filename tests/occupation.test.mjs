// Occupation agrégée par portée (carte KPI) : période / semaine / mois.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/store.js';
import { computeSchedule, occupationSummary, scopeWindow, rowInScope, prochainesActivites } from '../js/engine.js';

// État minimal : 2 jours ouverts en septembre (S36 et S37) + 1 en octobre.
// 18 créneaux de 30 min par jour (08:00 → 17:00).
function fixture() {
  const state = defaultState();
  state.team = [{ id: 'p1', name: 'TEST Formateur', quals: { 'HAB-ELEC': { F: true, T: true } } }];
  state.openDays = ['2026-09-01', '2026-09-08', '2026-10-05'];
  state.inscriptions = [
    // 2h de pratique le 01/09 (S36) : 4 créneaux
    { id: 1, stagiaire: 'UN', formation: 'HAB-ELEC', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, formateurId: 'p1', statut: 'confirmee' },
    // 2h le 08/09 (S37)
    { id: 2, stagiaire: 'DEUX', formation: 'HAB-ELEC', type: 'Initial', datePratique: '2026-09-08', debutPratique: 480, formateurId: 'p1', statut: 'confirmee' },
    // 2h le 05/10 (octobre)
    { id: 3, stagiaire: 'TROIS', formation: 'HAB-ELEC', type: 'Initial', datePratique: '2026-10-05', debutPratique: 480, formateurId: 'p1', statut: 'confirmee' },
  ];
  return state;
}

test('occupation : période complète', () => {
  const state = fixture();
  const occ = occupationSummary(state, computeSchedule(state), 'periode', '2026-09-01');
  assert.equal(occ.days, 3);
  assert.equal(occ.hours, 6);
  assert.equal(occ.pct, Math.round((12 / (3 * 18)) * 100)); // 22 %
});

test('occupation : semaine en cours (S36 ne compte que le 01/09)', () => {
  const state = fixture();
  const occ = occupationSummary(state, computeSchedule(state), 'semaine', '2026-09-03');
  assert.equal(occ.days, 1);
  assert.equal(occ.hours, 2);
  assert.equal(occ.pct, Math.round((4 / 18) * 100)); // 22 %
});

test('occupation : mois en cours (septembre = 2 jours, 4 h)', () => {
  const state = fixture();
  const occ = occupationSummary(state, computeSchedule(state), 'mois', '2026-09-15');
  assert.equal(occ.days, 2);
  assert.equal(occ.hours, 4);
  assert.equal(occ.pct, Math.round((8 / 36) * 100)); // 22 %
});

// La référence est le jour même, jamais ramenée ailleurs.
//
// Régression : elle était bornée à une période réglée à la main — avant le
// début, la carte « semaine en cours » affichait la première semaine de la
// période. Elle mentait donc sur son propre titre, et c'est la même
// confusion entre « ce qu'on affiche » et « ce qui est tenable » qui faisait
// basculer en anomalie les séances antérieures au début de période.
test('occupation : la référence est le jour même, sans bornage', () => {
  const state = fixture();
  const occ = occupationSummary(state, computeSchedule(state), 'semaine', '2026-07-11');
  assert.equal(occ.ref, '2026-07-11', 'aucun report sur une autre semaine');
  assert.equal(occ.days, 0, 'cette semaine-là ne porte aucun jour ouvert');
  assert.equal(occ.hours, 0);
  assert.equal(occ.pct, 0);
});

// « Le mois en cours » est le mois ENTIER, et non sa seule partie à venir.
//
// Régression : la portée était intersectée avec la fenêtre d'affichage, qui
// commence au lundi de la semaine en cours. Le 15 septembre, la carte du mois
// ne comptait donc plus que la seconde quinzaine et tombait à zéro.
test('portée « mois » : le mois entier, pas sa partie restante', () => {
  const state = fixture();
  const win = scopeWindow(state, 'mois', '2026-09-15');
  assert.equal(win.debut, '2026-09-01');
  assert.equal(win.fin, '2026-09-30');
  assert.deepEqual(win.openDays, ['2026-09-01', '2026-09-08'],
    'des jours ouverts antérieurs au 15 comptent toujours');
  assert.equal(win.workingCount, 22, 'les 22 jours ouvrables de septembre 2026');

  const wSem = scopeWindow(state, 'semaine', '2026-09-03');
  assert.equal(wSem.debut, '2026-08-31');
  assert.equal(wSem.fin, '2026-09-06');
  assert.equal(wSem.workingCount, 5);
});

test('occupation : ligne annulée libère la portée', () => {
  const state = fixture();
  state.inscriptions[0].statut = 'annulee';
  const occ = occupationSummary(state, computeSchedule(state), 'semaine', '2026-09-01');
  assert.equal(occ.hours, 0);
  assert.equal(occ.pct, 0);
});

test('portée : fenêtres et appartenance des lignes (toutes les cartes)', () => {
  const state = fixture();
  const schedule = computeSchedule(state);

  // Semaine S37 : seul le 08/09 est ouvert ; 5 jours ouvrables
  const wSem = scopeWindow(state, 'semaine', '2026-09-09');
  assert.equal(wSem.workingCount, 5);
  assert.deepEqual(wSem.openDays, ['2026-09-08']);
  assert.deepEqual(schedule.rows.filter((r) => rowInScope(r, wSem)).map((r) => r.insc.stagiaire), ['DEUX']);

  // Mois de septembre : 2 lignes (UN et DEUX), 2 jours ouverts
  const wMois = scopeWindow(state, 'mois', '2026-09-20');
  assert.equal(wMois.openDays.length, 2);
  assert.deepEqual(schedule.rows.filter((r) => rowInScope(r, wMois)).map((r) => r.insc.stagiaire), ['UN', 'DEUX']);

  // Période : tout, y compris une inscription non planifiée
  state.inscriptions.push({ id: 4, stagiaire: 'SANS DATE', formation: 'HAB-ELEC', type: 'Initial', statut: 'confirmee' });
  const schedule2 = computeSchedule(state);
  const wPer = scopeWindow(state, 'periode', '2026-09-20');
  assert.equal(schedule2.rows.filter((r) => rowInScope(r, wPer)).length, 4);
  // …mais pas dans une portée datée
  assert.equal(schedule2.rows.filter((r) => rowInScope(r, wMois)).length, 2);

  // Un test pratique dans la portée suffit (activité de la semaine)
  const wS37 = scopeWindow(state, 'semaine', '2026-09-08');
  const rowUn = schedule2.rows.find((r) => r.insc.stagiaire === 'UN');
  rowUn.insc.dateTestPratique = '2026-09-08';
  rowUn.insc.debutTestPratique = 600;
  assert.equal(rowInScope(rowUn, wS37), true);
});

test('occupation : portée sans jour ouvert → 0 % sans division par zéro', () => {
  const state = fixture();
  const occ = occupationSummary(state, computeSchedule(state), 'mois', '2026-12-15');
  assert.equal(occ.days, 0);
  assert.equal(occ.pct, 0);
});

// « Prochaines activités » du tableau de bord. La carte prenait les premières
// lignes triées par date, sans plancher : sur la portée « période » elle
// affichait donc les plus ANCIENNES — septembre en décembre. Le titre
// promettait l'avenir, le contenu montrait un passé révolu.
test('prochaines activités : à partir d’aujourd’hui, les plus proches d’abord', () => {
  const state = fixture();
  const { rows } = computeSchedule(state);

  const avant = prochainesActivites(rows, { aujourdHui: '2026-09-01' });
  assert.deepEqual(avant.lignes.map((r) => r.insc.stagiaire), ['UN', 'DEUX', 'TROIS'],
    'tout est à venir, du plus proche au plus lointain');
  assert.equal(avant.passees, 0);

  // Le 08/09 lui-même compte comme à venir : une séance du jour n'est pas
  // du passé.
  const leJour = prochainesActivites(rows, { aujourdHui: '2026-09-08' });
  assert.deepEqual(leJour.lignes.map((r) => r.insc.stagiaire), ['DEUX', 'TROIS']);
  assert.equal(leJour.passees, 1, 'la séance du 01/09 est passée');

  // Tout est passé : aucune ligne, et le compte permet de le DIRE au lieu
  // d'afficher un tableau vide sans explication.
  const apres = prochainesActivites(rows, { aujourdHui: '2026-11-01' });
  assert.deepEqual(apres.lignes, []);
  assert.equal(apres.passees, 3);

  // Le plafond est respecté
  assert.equal(prochainesActivites(rows, { aujourdHui: '2026-09-01', max: 2 }).lignes.length, 2);
});

test('prochaines activités : une inscription sans date n’y figure pas', () => {
  const state = fixture();
  state.inscriptions.push({ id: 99, stagiaire: 'SANS DATE', formation: 'HAB-ELEC', type: 'Initial', statut: 'confirmee' });
  const { rows } = computeSchedule(state);
  const r = prochainesActivites(rows, { aujourdHui: '2026-09-01' });
  assert.ok(!r.lignes.some((l) => l.insc.stagiaire === 'SANS DATE'),
    'une ligne non planifiée n’est ni à venir ni passée : elle n’a pas de date');
  assert.equal(r.passees, 0);
});
