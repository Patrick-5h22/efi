// Suivi du chiffre d'affaires : agrégation par mois et par formation,
// et contrôles de saisie (dossier YPAREO, montants répétés).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, addInscription, migrate, montantOuNull } from '../js/store.js';
import { caSummary, anneesDisponibles, doublonsDossier, ypareoValide, moisLabel } from '../js/ca.js';

function fixture() {
  const state = defaultState();
  state.openDays = ['2026-09-01', '2026-10-01'];
  return state;
}

test('montant : saisie tolérante, invalide = non renseigné', () => {
  assert.equal(montantOuNull('1200'), 1200);
  assert.equal(montantOuNull('1200,50'), 1200.5, 'virgule décimale acceptée');
  assert.equal(montantOuNull('1 200'), 1200, 'espace de milliers accepté');
  assert.equal(montantOuNull(0), 0, 'zéro est une saisie valide');
  assert.equal(montantOuNull(''), null);
  assert.equal(montantOuNull(null), null);
  assert.equal(montantOuNull(undefined), null);
  assert.equal(montantOuNull('abc'), null, 'texte : non renseigné plutôt que 0');
  assert.equal(montantOuNull(-50), null, 'montant négatif refusé');
});

test('inscription : dossier et CA persistés, absents par défaut', () => {
  const state = fixture();
  const a = addInscription(state, { stagiaire: 'UN', formation: 'R489-3', dossierYpareo: '0123456789', chiffreAffaires: '850' });
  assert.equal(a.dossierYpareo, '0123456789');
  assert.equal(a.chiffreAffaires, 850);
  const b = addInscription(state, { stagiaire: 'DEUX', formation: 'R489-3' });
  assert.equal(b.dossierYpareo, null);
  assert.equal(b.chiffreAffaires, null);
});

test('migration : les inscriptions antérieures reçoivent les champs de gestion', () => {
  const old = {
    version: 1,
    inscriptions: [{ id: 1, stagiaire: 'ANCIEN', formation: 'R489-3', statut: 'confirmee' }],
  };
  const i = migrate(old).inscriptions[0];
  assert.equal(i.dossierYpareo, null);
  assert.equal(i.chiffreAffaires, null);
});

test('CA : agrégation par mois puis par formation, sur la date de pratique', () => {
  const state = fixture();
  addInscription(state, { stagiaire: 'UN', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 480, chiffreAffaires: 800, dossierYpareo: '1000000001' });
  addInscription(state, { stagiaire: 'DEUX', formation: 'R489-3', datePratique: '2026-09-15', debutPratique: 480, chiffreAffaires: 200, dossierYpareo: '1000000002' });
  addInscription(state, { stagiaire: 'TROIS', formation: 'HAB-ELEC', datePratique: '2026-10-01', debutPratique: 480, chiffreAffaires: 500, dossierYpareo: '1000000003' });

  const ca = caSummary(state, '2026');
  assert.equal(ca.total, 1500);
  assert.equal(ca.lignes, 3);
  assert.equal(ca.dossiers, 3);
  assert.equal(ca.mois.length, 2, 'septembre et octobre');
  assert.equal(ca.mois[0].label, 'Septembre 2026');
  assert.equal(ca.mois[0].total, 1000, 'sous-total mensuel');
  assert.equal(ca.mois[1].total, 500);
  // Total par formation sur l'année, du plus gros au plus petit
  assert.equal(ca.formations[0].code, 'R489-3');
  assert.equal(ca.formations[0].total, 1000);
  assert.equal(ca.formations[1].total, 500);
});

test('CA : les inscriptions annulées sont exclues', () => {
  const state = fixture();
  addInscription(state, { stagiaire: 'UN', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 480, chiffreAffaires: 800 });
  addInscription(state, { stagiaire: 'DEUX', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 480, chiffreAffaires: 900, statut: 'annulee' });
  const ca = caSummary(state, '2026');
  assert.equal(ca.total, 800);
  assert.equal(ca.lignes, 1);
});

test('CA : une pré-réservation est facturée comme une confirmée', () => {
  const state = fixture();
  addInscription(state, { stagiaire: 'UN', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 480, chiffreAffaires: 400, statut: 'pre' });
  assert.equal(caSummary(state, '2026').total, 400);
});

test('CA : ligne facturée sans date de pratique isolée, pas diluée', () => {
  const state = fixture();
  addInscription(state, { stagiaire: 'UN', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 480, chiffreAffaires: 800 });
  addInscription(state, { stagiaire: 'PAS PLANIFIE', formation: 'R489-3', chiffreAffaires: 300 });
  const ca = caSummary(state, '2026');
  assert.equal(ca.total, 800, 'la ligne sans date ne gonfle pas le total');
  assert.equal(ca.sansDate.count, 1);
  assert.equal(ca.sansDate.total, 300);
});

test('CA : seule l’année demandée est agrégée', () => {
  const state = fixture();
  addInscription(state, { stagiaire: 'UN', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 480, chiffreAffaires: 800 });
  addInscription(state, { stagiaire: 'DEUX', formation: 'R489-3', datePratique: '2027-02-01', debutPratique: 480, chiffreAffaires: 999 });
  assert.equal(caSummary(state, '2026').total, 800);
  assert.equal(caSummary(state, '2027').total, 999);
  assert.deepEqual(anneesDisponibles(state), ['2026', '2027']);
});

test('contrôle : montant identique répété sur un même dossier signalé', () => {
  const state = fixture();
  // Un stagiaire, deux catégories, le montant du dossier recopié sur chaque ligne
  addInscription(state, { stagiaire: 'DUPONT Jean', formation: 'R489-1A', datePratique: '2026-09-01', debutPratique: 480, chiffreAffaires: 1200, dossierYpareo: '2000000001' });
  addInscription(state, { stagiaire: 'DUPONT Jean', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 600, chiffreAffaires: 1200, dossierYpareo: '2000000001' });
  const ca = caSummary(state, '2026');
  assert.equal(ca.doublons.length, 1);
  assert.equal(ca.doublons[0].dossier, '2000000001');
  assert.equal(ca.doublons[0].lignes, 2);
  assert.equal(ca.total, 2400, 'le total reste la somme brute : on signale, on ne corrige pas');
});

test('contrôle : montants différents sur un même dossier ne sont pas signalés', () => {
  const lignes = [
    { dossierYpareo: '3000000001', chiffreAffaires: 800, stagiaire: 'X' },
    { dossierYpareo: '3000000001', chiffreAffaires: 400, stagiaire: 'X' },
  ];
  assert.deepEqual(doublonsDossier(lignes), []);
});

test('contrôle : n° YPAREO à 10 chiffres', () => {
  assert.equal(ypareoValide('0123456789'), true);
  assert.equal(ypareoValide('123'), false);
  assert.equal(ypareoValide('01234567890'), false);
  assert.equal(ypareoValide('01234abcde'), false);
  assert.equal(ypareoValide(''), false);
  assert.equal(ypareoValide(null), false);
});

test('libellé de mois en français', () => {
  assert.equal(moisLabel('2026-09'), 'Septembre 2026');
  assert.equal(moisLabel('2026-12'), 'Décembre 2026');
});
