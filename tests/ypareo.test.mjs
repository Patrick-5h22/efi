// Export YPAREO — une ligne par parcours, la catégorie en champ texte.
//
// Demande d'Emmanuel (18/09/2026) : « basculer l'inscription d'un stagiaire sur
// un parcours dans YPAREO sans distinction de la catégorie autrement que par un
// champ texte » — Formation = R489, Commentaire = Cat. 1A, 3, 5.
//
// C'est une conséquence du regroupement, pas un calcul. Sans le parcours, il
// aurait fallu inventer une règle pour décider quelles lignes d'un même
// stagiaire forment une seule inscription YPAREO — et se tromper le jour où le
// même candidat revient pour une autre vente.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, addInscription, addParcours } from '../js/store.js';
import { lignesYpareo, ypareoCSV, libelleCategorie, COLONNES_YPAREO } from '../js/ypareo.js';
import {
  formationByCode, recommandations, categoriesDe, libelleCourt,
} from '../js/config.js';

function fixture() {
  const s = defaultState();
  s.openDays = { perigny: ['2026-09-01'] };
  s.inscriptions = [];
  return s;
}

function vendre(state, { montant = null, dossier = null, lignes = [] } = {}) {
  const p = addParcours(state, { chiffreAffaires: montant, dossierYpareo: dossier });
  for (const l of lignes) addInscription(state, { ...l, parcoursId: p.id });
  return p;
}

const cat = (s, code) => libelleCategorie(formationByCode(s.formations, code), code);

// --- Le champ texte -------------------------------------------------------

test('catégorie : le libellé se réduit à « Cat. X »', () => {
  const s = fixture();
  // La recommandation est déjà dans la colonne Formation : la répéter dans le
  // commentaire donnerait « R489 — Cat. Pratique R489 Cat 3 ».
  assert.equal(cat(s, 'R489-3'), 'Cat. 3');
  assert.equal(cat(s, 'R489-1A'), 'Cat. 1A');
  assert.equal(cat(s, 'R486-A'), 'Cat. A');
});

test('catégorie : un dispositif sans catégorie garde son nom', () => {
  const s = fixture();
  // « Cat. » vide n'aiderait personne côté YPAREO.
  assert.equal(cat(s, 'HAB-ELEC'), 'Habilitation électrique');
  assert.equal(cat(s, 'AIPR'), 'AIPR (épreuve sur site)');
  assert.equal(libelleCategorie(null, 'INCONNU'), 'INCONNU');
});

// --- Une ligne par vente --------------------------------------------------

test('export : trois catégories, une seule ligne', () => {
  const s = fixture();
  vendre(s, {
    montant: 900, dossier: '1234567890',
    lignes: [
      { stagiaire: 'DURAND Thomas', entreprise: 'ACT SERVICE', siret: '12345678900011', formation: 'R489-1A', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480 },
      { stagiaire: 'DURAND Thomas', formation: 'R489-3', type: 'Initial', datePratique: '2026-09-01', debutPratique: 600 },
      { stagiaire: 'DURAND Thomas', formation: 'R489-5', type: 'Initial', datePratique: '2026-09-02', debutPratique: 480 },
    ],
  });
  const [l] = lignesYpareo(s);
  assert.equal(lignesYpareo(s).length, 1);
  assert.equal(l.stagiaire, 'DURAND Thomas');
  assert.equal(l.entreprise, 'ACT SERVICE');
  assert.equal(l.siret, '12345678900011');
  assert.equal(l.dossierYpareo, '1234567890');
  assert.equal(l.formation, 'R489', 'la recommandation, pas les catégories');
  assert.equal(l.commentaire, 'Cat. 1A, Cat. 3, Cat. 5');
  assert.equal(l.regime, 'Initial');
  assert.equal(l.chiffreAffaires, 900);
  assert.equal(l.debut, '2026-09-01');
  assert.equal(l.fin, '2026-09-02');
  assert.equal(l.seances, 3);
  assert.equal(l.statut, 'confirmé');
});

test('export : les séances annulées sortent, la vente reste', () => {
  const s = fixture();
  vendre(s, {
    montant: 900,
    lignes: [
      { stagiaire: 'UN', formation: 'R489-1A', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480 },
      { stagiaire: 'UN', formation: 'R489-3', type: 'Initial', datePratique: '2026-09-01', debutPratique: 600, statut: 'annulee' },
    ],
  });
  const [l] = lignesYpareo(s);
  assert.equal(l.commentaire, 'Cat. 1A', 'la catégorie annulée n’est pas transmise');
  assert.equal(l.seances, 1);
});

test('export : une vente entièrement annulée disparaît', () => {
  const s = fixture();
  vendre(s, {
    montant: 900,
    lignes: [{ stagiaire: 'UN', formation: 'R489-3', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, statut: 'annulee' }],
  });
  assert.deepEqual(lignesYpareo(s), [], 'plus rien à transmettre');
});

test('export : une pré-réservation se distingue d’une inscription confirmée', () => {
  const s = fixture();
  vendre(s, { lignes: [{ stagiaire: 'UN', formation: 'R489-3', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480, statut: 'pre' }] });
  assert.equal(lignesYpareo(s)[0].statut, 'pré-réservé');
});

test('export : un parcours mixte nomme ses deux régimes plutôt que d’en choisir un', () => {
  const s = fixture();
  vendre(s, {
    lignes: [
      { stagiaire: 'UN', formation: 'R489-1A', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480 },
      { stagiaire: 'UN', formation: 'R489-3', type: 'Recyclage', datePratique: '2026-09-01', debutPratique: 600 },
    ],
  });
  assert.equal(lignesYpareo(s)[0].regime, 'Initial + Recyclage');
});

test('export : les ventes sortent dans l’ordre des dates', () => {
  const s = fixture();
  vendre(s, { lignes: [{ stagiaire: 'TARD', formation: 'R489-3', type: 'Initial', datePratique: '2026-10-01', debutPratique: 480 }] });
  vendre(s, { lignes: [{ stagiaire: 'TOT', formation: 'R489-3', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480 }] });
  // Une vente sans date passe en dernier plutôt que de remonter en tête.
  vendre(s, { lignes: [{ stagiaire: 'SANS DATE', formation: 'R489-3', type: 'Initial' }] });
  assert.deepEqual(lignesYpareo(s).map((l) => l.stagiaire), ['TOT', 'TARD', 'SANS DATE']);
});

// --- Le fichier -----------------------------------------------------------

test('CSV : en-tête, séparateur et BOM', () => {
  const s = fixture();
  vendre(s, {
    montant: 900, dossier: '1234567890',
    lignes: [
      { stagiaire: 'DURAND Thomas', formation: 'R489-1A', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480 },
      { stagiaire: 'DURAND Thomas', formation: 'R489-3', type: 'Initial', datePratique: '2026-09-01', debutPratique: 600 },
    ],
  });
  const csv = ypareoCSV(s);
  assert.ok(csv.startsWith('﻿'), 'BOM : sans lui Excel lit l’UTF-8 en latin-1');
  const lignes = csv.replace('﻿', '').split('\r\n');
  assert.equal(lignes.length, 2, 'un en-tête et une vente');
  assert.equal(lignes[0], COLONNES_YPAREO.map(([, t]) => `"${t}"`).join(';'));
  assert.ok(lignes[1].includes('"R489"'));
  assert.ok(lignes[1].includes('"Cat. 1A, Cat. 3"'));
});

test('CSV : les guillemets d’une raison sociale ne cassent pas le fichier', () => {
  const s = fixture();
  vendre(s, {
    lignes: [{ stagiaire: 'UN', entreprise: 'SARL "LE PONT"', formation: 'R489-3', type: 'Initial', datePratique: '2026-09-01', debutPratique: 480 }],
  });
  const ligne = ypareoCSV(s).split('\r\n')[1];
  assert.ok(ligne.includes('"SARL ""LE PONT"""'), ligne);
});

// --- Recommandation et catégories, tels que la saisie les présente ---------

test('saisie : les recommandations viennent du catalogue, pas d’une liste figée', () => {
  const s = fixture();
  const avant = recommandations(s.formations);
  assert.ok(avant.includes('R489') && avant.includes('AIPR'), avant.join(', '));
  // La R482 est arrivée au catalogue le 06/10 et figure donc dans la liste
  // sans qu'aucune liste séparée n'ait eu à être tenue à jour.
  assert.ok(avant.includes('R482'), avant.join(', '));
  assert.ok(!avant.includes('R490'), 'une recommandation absente reste absente');

  // Une formation créée dans Paramètres apparaît d'elle-même : une liste
  // séparée aurait fini par diverger du catalogue.
  s.formations.push({
    code: 'R490-1', label: 'Pratique R490 Cat 1', reco: 'R490',
    dureeInitial: 90, dureeRecyclage: 60, tests: false, capacite: 1,
  });
  assert.ok(recommandations(s.formations).includes('R490'));
});

test('saisie : les catégories d’une recommandation, et elles seules', () => {
  const s = fixture();
  const cats = categoriesDe(s.formations, 'R489').map((f) => f.code);
  assert.deepEqual(cats, ['R489-1A', 'R489-1B', 'R489-3', 'R489-5']);
  assert.deepEqual(categoriesDe(s.formations, 'INCONNUE'), []);
  // Les deux modalités AIPR sont bien deux choix distincts.
  assert.equal(categoriesDe(s.formations, 'AIPR').length, 2);
});

test('saisie : la case à cocher ne répète pas la recommandation', () => {
  const s = fixture();
  const court = (code) => libelleCourt(formationByCode(s.formations, code));
  assert.equal(court('R489-3'), 'Cat. 3');
  assert.equal(court('R489-1A'), 'Cat. 1A');
  // Un dispositif sans catégorie garde son nom plutôt qu'un « Cat. » vide.
  assert.equal(court('HAB-ELEC'), 'Habilitation électrique');
  assert.equal(libelleCourt(null), '');
});
