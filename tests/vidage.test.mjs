// Vider les inscriptions sans emporter la configuration.
//
// « Réinitialiser toutes les données » remet l'état par défaut : équipe,
// jours EFI, présence des intervenants, catalogue et paramètres compris, puis
// resème les quatre exemples. Pour repartir d'un planning vide en vue d'une
// campagne de tests, c'est trop : la présence des intervenants se coche jour
// par jour, et la reperdre à chaque remise à zéro coûte plus cher que les
// inscriptions elles-mêmes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, addInscription, viderInscriptions, exportJSON, importJSON } from '../js/store.js';
import { computeSchedule } from '../js/engine.js';

function etatGarni() {
  const state = defaultState();
  state.openDays = ['2026-09-14', '2026-09-15'];
  state.dayPresence = { '2026-09-14': ['p1'], '2026-09-15': ['p1', 'p2'] };
  state.dayAssignments = { '2026-09-14': { formateur: 'p1', testeur: 'p2' } };
  state.params.maxDailyLoad = 420;
  for (const nom of ['UN Premier', 'DEUX Second', 'TROIS Troisieme']) {
    addInscription(state, {
      stagiaire: nom, formation: 'R489-1A', type: 'Initial',
      datePratique: '2026-09-14', debutPratique: 480,
      chiffreAffaires: 1250, dossierYpareo: '0123456789',
    });
  }
  return state;
}

test('vidage : les inscriptions partent, la configuration reste', () => {
  const state = etatGarni();
  const avant = {
    team: structuredClone(state.team),
    formations: structuredClone(state.formations),
    openDays: structuredClone(state.openDays),
    dayPresence: structuredClone(state.dayPresence),
    dayAssignments: structuredClone(state.dayAssignments),
    params: structuredClone(state.params),
  };

  const n = viderInscriptions(state);

  assert.equal(n, 3, 'rend le nombre de lignes retirées');
  assert.deepEqual(state.inscriptions, []);
  assert.deepEqual(state.team, avant.team, 'l’équipe est conservée');
  assert.deepEqual(state.formations, avant.formations, 'le catalogue est conservé');
  assert.deepEqual(state.openDays, avant.openDays, 'les jours EFI ouverts sont conservés');
  assert.deepEqual(state.dayPresence, avant.dayPresence, 'la présence des intervenants est conservée');
  assert.deepEqual(state.dayAssignments, avant.dayAssignments, 'les affectations du jour sont conservées');
  assert.deepEqual(state.params, avant.params, 'les paramètres sont conservés');
});

// Un identifiant déjà attribué ne doit jamais l'être une seconde fois : une
// sauvegarde réimportée après un vidage porterait sinon des numéros entre-temps
// réutilisés, et deux lignes différentes se retrouveraient avec le même.
test('vidage : nextId n’est pas remis à 1', () => {
  const state = etatGarni();
  const suivant = state.nextId;
  assert.equal(suivant, 4);

  viderInscriptions(state);
  assert.equal(state.nextId, suivant, 'le compteur ne recule pas');

  const neuve = addInscription(state, { stagiaire: 'APRES Vidage', formation: 'R489-1A', type: 'Initial' });
  assert.equal(neuve.id, 4, 'la ligne suivante prend un numéro jamais utilisé');
});

test('vidage : le planning recalculé est vide et sans anomalie', () => {
  const state = etatGarni();
  assert.ok(computeSchedule(state).rows.length > 0);
  viderInscriptions(state);
  const { rows } = computeSchedule(state);
  assert.deepEqual(rows, []);
});

// La sauvegarde téléchargée juste avant le vidage doit pouvoir être relue :
// c'est tout l'intérêt du filet.
test('vidage : la sauvegarde prise avant reste réimportable', () => {
  const state = etatGarni();
  const sauvegarde = exportJSON(state);
  viderInscriptions(state);
  assert.deepEqual(state.inscriptions, []);

  const restaure = importJSON(sauvegarde);
  assert.equal(restaure.inscriptions.length, 3);
  assert.deepEqual(restaure.inscriptions.map((i) => i.stagiaire),
    ['UN Premier', 'DEUX Second', 'TROIS Troisieme']);
  assert.equal(restaure.inscriptions[0].chiffreAffaires, 1250, 'le CA revient avec');
  assert.equal(restaure.inscriptions[0].dossierYpareo, '0123456789');
  assert.deepEqual(restaure.dayPresence, { '2026-09-14': ['p1'], '2026-09-15': ['p1', 'p2'] });
});

test('vidage : sur un planning déjà vide, rien à faire et aucune erreur', () => {
  const state = defaultState();
  state.inscriptions = [];
  assert.equal(viderInscriptions(state), 0);
  assert.deepEqual(state.inscriptions, []);
});
