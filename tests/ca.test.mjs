// Suivi du chiffre d'affaires : un montant par PARCOURS, agrégé par mois puis
// par recommandation.
//
// Ce fichier porte la trace du changement de modèle. Le montant était
// auparavant saisi sur la LIGNE : un dossier couvrant trois catégories
// occupait trois lignes, et le même montant recopié sur chacune comptait trois
// fois. Un contrôle signalait ce cas sans pouvoir le corriger — il ne savait
// pas laquelle des trois portait la vérité. Le parcours supprime la cause :
// il n'y a plus qu'un seul endroit où écrire le montant.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  defaultState, addInscription, addParcours, migrate, montantOuNull,
  purgerParcoursVides, removeInscription,
} from '../js/store.js';
import { caSummary, anneesDisponibles, parcoursFactures, ypareoValide, moisLabel } from '../js/ca.js';

function fixture() {
  const state = defaultState();
  state.openDays = { perigny: ['2026-09-01', '2026-10-01'] };
  return state;
}

// Une vente : un parcours, et ses séances.
function vendre(state, { montant = null, dossier = null, lignes = [] } = {}) {
  const p = addParcours(state, { chiffreAffaires: montant, dossierYpareo: dossier });
  for (const l of lignes) addInscription(state, { ...l, parcoursId: p.id });
  return p;
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

// --- Le parcours ----------------------------------------------------------

test('parcours : il porte le montant et le dossier, la ligne ne les porte plus', () => {
  const state = fixture();
  const p = vendre(state, {
    montant: '850', dossier: '0123456789',
    lignes: [{ stagiaire: 'UN', formation: 'R489-3' }],
  });
  assert.equal(p.chiffreAffaires, 850);
  assert.equal(p.dossierYpareo, '0123456789');

  const ligne = state.inscriptions[0];
  assert.equal(ligne.parcoursId, p.id);
  assert.ok(!('chiffreAffaires' in ligne), 'le montant a quitté la ligne');
  assert.ok(!('dossierYpareo' in ligne), 'le dossier aussi');

  const vide = addParcours(state);
  assert.equal(vide.chiffreAffaires, null);
  assert.equal(vide.dossierYpareo, null);
});

test('parcours : il ne porte ni stagiaire ni recommandation — tout se déduit', () => {
  // Les stocker créerait une seconde source de vérité, qui finirait par
  // contredire les séances.
  const state = fixture();
  const p = vendre(state, {
    montant: 900,
    lignes: [
      { stagiaire: 'DURAND Thomas', formation: 'R489-1A', datePratique: '2026-09-01', debutPratique: 480 },
      { stagiaire: 'DURAND Thomas', formation: 'R489-3', datePratique: '2026-09-02', debutPratique: 480 },
    ],
  });
  assert.deepEqual(Object.keys(p).sort(), ['chiffreAffaires', 'dossierYpareo', 'id']);

  const [vu] = parcoursFactures(state);
  assert.equal(vu.stagiaire, 'DURAND Thomas', 'déduit des lignes');
  assert.deepEqual(vu.recos, ['R489']);
  assert.equal(vu.debut, '2026-09-01', 'la première pratique du parcours');
});

test('parcours : retirer la dernière séance retire le parcours', () => {
  // Sinon son montant continuerait de compter sans une seule séance pour le
  // justifier, et il ne serait visible nulle part pour être corrigé.
  const state = fixture();
  const p = vendre(state, {
    montant: 500,
    lignes: [
      { stagiaire: 'UN', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 480 },
      { stagiaire: 'UN', formation: 'R489-5', datePratique: '2026-09-01', debutPratique: 600 },
    ],
  });
  removeInscription(state, state.inscriptions[0].id);
  assert.equal(state.parcours.length, 1, 'une séance reste : le parcours aussi');
  removeInscription(state, state.inscriptions[0].id);
  assert.equal(state.parcours.length, 0);
  assert.equal(caSummary(state, '2026').total, 0);
  assert.ok(p, 'le parcours avait bien existé');
});

test('parcours : purger ne touche pas à ce qui a encore des séances', () => {
  const state = fixture();
  vendre(state, { montant: 100, lignes: [{ stagiaire: 'UN', formation: 'R489-3' }] });
  addParcours(state, { chiffreAffaires: 999 }); // orphelin
  assert.equal(purgerParcoursVides(state), 1);
  assert.equal(state.parcours.length, 1);
  assert.equal(state.parcours[0].chiffreAffaires, 100);
});

// --- Reprise --------------------------------------------------------------

test('reprise : chaque ligne d’un état ancien reçoit son propre parcours', () => {
  // Un pour un : regrouper d'office les lignes d'un même stagiaire serait une
  // interprétation, pas une reprise. Le total doit être inchangé à l'euro près.
  const ancien = {
    version: 1,
    inscriptions: [
      { id: 1, stagiaire: 'DUPONT Jean', formation: 'R489-1A', statut: 'confirmee', datePratique: '2026-09-01', debutPratique: 480, chiffreAffaires: 1200, dossierYpareo: '2000000001' },
      { id: 2, stagiaire: 'DUPONT Jean', formation: 'R489-3', statut: 'confirmee', datePratique: '2026-09-01', debutPratique: 600, chiffreAffaires: 1200, dossierYpareo: '2000000001' },
      { id: 3, stagiaire: 'SANS MONTANT', formation: 'R489-3', statut: 'confirmee' },
    ],
  };
  const s = migrate(ancien);
  assert.equal(s.parcours.length, 3, 'un parcours par ligne');
  assert.deepEqual(s.inscriptions.map((i) => i.parcoursId).sort(), [1, 2, 3]);
  for (const i of s.inscriptions) {
    assert.ok(!('chiffreAffaires' in i), 'le champ a quitté la ligne');
    assert.ok(!('dossierYpareo' in i));
  }
  // Le total est identique à celui d'avant : la reprise ne perd ni n'invente.
  assert.equal(caSummary(s, '2026').total, 2400);
  assert.equal(s.parcours.filter((p) => p.chiffreAffaires == null).length, 1);
});

test('reprise : une ligne rattachée à un parcours disparu ne pointe pas dans le vide', () => {
  const s = migrate({
    version: 1,
    parcours: [],
    inscriptions: [{ id: 1, stagiaire: 'X', formation: 'R489-3', statut: 'confirmee', parcoursId: 7 }],
  });
  assert.equal(s.inscriptions[0].parcoursId, 7);
  assert.ok(s.parcours.some((p) => p.id === 7), 'le parcours est recréé');
  assert.ok(s.nextParcoursId > 7, 'et le compteur ne repassera pas dessus');
});

// --- L'agrégation ---------------------------------------------------------

test('CA : agrégation par mois puis par recommandation', () => {
  const state = fixture();
  vendre(state, { montant: 800, dossier: '1000000001', lignes: [{ stagiaire: 'UN', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 480 }] });
  vendre(state, { montant: 200, dossier: '1000000002', lignes: [{ stagiaire: 'DEUX', formation: 'R489-3', datePratique: '2026-09-15', debutPratique: 480 }] });
  vendre(state, { montant: 500, dossier: '1000000003', lignes: [{ stagiaire: 'TROIS', formation: 'HAB-ELEC', datePratique: '2026-10-01', debutPratique: 480 }] });

  const ca = caSummary(state, '2026');
  assert.equal(ca.total, 1500);
  assert.equal(ca.lignes, 3, 'trois ventes');
  assert.equal(ca.dossiers, 3);
  assert.equal(ca.mois.length, 2, 'septembre et octobre');
  assert.equal(ca.mois[0].label, 'Septembre 2026');
  assert.equal(ca.mois[0].total, 1000);
  assert.equal(ca.mois[1].total, 500);
  assert.equal(ca.formations[0].code, 'R489', 'ventilé par recommandation');
  assert.equal(ca.formations[0].total, 1000);
  assert.equal(ca.formations[1].code, 'HAB ELEC');
});

test('CA : une vente à trois catégories ne compte qu’une fois', () => {
  // C'est tout l'objet du parcours. Avant, ce même cas donnait 2700 €.
  const state = fixture();
  vendre(state, {
    montant: 900, dossier: '2000000001',
    lignes: [
      { stagiaire: 'DUPONT Jean', formation: 'R489-1A', datePratique: '2026-09-01', debutPratique: 480 },
      { stagiaire: 'DUPONT Jean', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 600 },
      { stagiaire: 'DUPONT Jean', formation: 'R489-5', datePratique: '2026-09-01', debutPratique: 720 },
    ],
  });
  const ca = caSummary(state, '2026');
  assert.equal(ca.total, 900);
  assert.equal(ca.lignes, 1, 'une vente');
  assert.equal(ca.seances, 3, 'trois séances couvertes');
  assert.equal(ca.dossiers, 1);
});

test('CA : un parcours entièrement annulé est exclu, partiellement annulé non', () => {
  const state = fixture();
  vendre(state, { montant: 800, lignes: [{ stagiaire: 'UN', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 480 }] });
  vendre(state, { montant: 900, lignes: [{ stagiaire: 'DEUX', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 480, statut: 'annulee' }] });
  assert.equal(caSummary(state, '2026').total, 800);

  // Une seule catégorie annulée sur trois : la vente tient toujours.
  const t = fixture();
  vendre(t, {
    montant: 900,
    lignes: [
      { stagiaire: 'TROIS', formation: 'R489-1A', datePratique: '2026-09-01', debutPratique: 480 },
      { stagiaire: 'TROIS', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 600, statut: 'annulee' },
    ],
  });
  assert.equal(caSummary(t, '2026').total, 900);
  assert.equal(caSummary(t, '2026').seances, 1, 'la séance annulée ne compte pas');
});

test('CA : une pré-réservation est facturée comme une confirmée', () => {
  const state = fixture();
  vendre(state, { montant: 400, lignes: [{ stagiaire: 'UN', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 480, statut: 'pre' }] });
  assert.equal(caSummary(state, '2026').total, 400);
});

test('CA : une vente sans date de pratique est isolée, pas diluée', () => {
  const state = fixture();
  vendre(state, { montant: 800, lignes: [{ stagiaire: 'UN', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 480 }] });
  vendre(state, { montant: 300, lignes: [{ stagiaire: 'PAS PLANIFIE', formation: 'R489-3' }] });
  const ca = caSummary(state, '2026');
  assert.equal(ca.total, 800, 'la vente sans date ne gonfle pas le total');
  assert.equal(ca.sansDate.count, 1);
  assert.equal(ca.sansDate.total, 300);
});

test('CA : seule l’année demandée est agrégée', () => {
  const state = fixture();
  vendre(state, { montant: 800, lignes: [{ stagiaire: 'UN', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 480 }] });
  vendre(state, { montant: 999, lignes: [{ stagiaire: 'DEUX', formation: 'R489-3', datePratique: '2027-02-01', debutPratique: 480 }] });
  assert.equal(caSummary(state, '2026').total, 800);
  assert.equal(caSummary(state, '2027').total, 999);
  assert.deepEqual(anneesDisponibles(state), ['2026', '2027']);
});

test('CA : deux recommandations dans une vente restent nommées toutes les deux', () => {
  // Plutôt que d'en élire une, ce qui ferait disparaître l'autre du suivi.
  const state = fixture();
  vendre(state, {
    montant: 1000,
    lignes: [
      { stagiaire: 'MIXTE', formation: 'R489-3', datePratique: '2026-09-01', debutPratique: 480 },
      { stagiaire: 'MIXTE', formation: 'HAB-ELEC', datePratique: '2026-09-02', debutPratique: 480 },
    ],
  });
  const ca = caSummary(state, '2026');
  assert.equal(ca.formations.length, 1);
  assert.equal(ca.formations[0].code, 'HAB ELEC + R489');
  assert.equal(ca.total, 1000, 'compté une fois, pas une par recommandation');
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
