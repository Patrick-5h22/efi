// Chaque champ d'inscription a-t-il une colonne dans la base partagée ?
//
// Le schéma Supabase est relationnel : efi_save_state écrit une liste de
// colonnes explicite, efi_load_state reconstruit le JSON depuis ces colonnes.
// Un champ sans colonne est donc envoyé, accepté sans erreur, et perdu — la
// saisie revient vide au rechargement suivant. Aucun autre test ne peut le
// voir : ils remplacent Supabase par un faux qui garde tout ce qu'on lui donne.
//
// Ce test est le seul endroit du dépôt qui connaisse la vraie base. Il ne la
// contacte pas : il compare les champs de l'application au relevé ci-dessous,
// et refuse tout NOUVEL écart.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, addInscription } from '../js/store.js';

// Colonnes de planning.inscriptions telles que les migrations du dépôt les
// définissent — et telles que les deux RPC les écrivent et les relisent
// (docs/migrations/003-persister-tous-les-champs.sql). À mettre à jour en même
// temps que toute migration.
//
// Ce que déclare cette liste, c'est la CIBLE. Une base où la migration n'a pas
// encore été appliquée perd toujours les champs : la vérifier demande
// « EFI_ACCESS_CODE=… npm run persistance », qui interroge la vraie base.
const COLONNES = [
  'id', 'stagiaire', 'formation', 'type',
  'date_pratique', 'debut_pratique', 'date_theorie',
  'date_test_pratique', 'debut_test_pratique',
  'formateur_id', 'testeur_id', 'updated_at',
  'entreprise', 'siret', 'statut', 'motif_annulation',
  // Ajoutés par les migrations 002 et 003
  'dossier_ypareo', 'chiffre_affaires', 'mode_theorie',
  'date_theorie_formation', 'debut_theorie_formation', 'duree_theorie_centre',
  'formateur_theorie_id', 'reserve_par', 'reserve_le',
];

// Champs posés par le serveur MCP (js/mcp.js) et non par addInscription :
// la trace de l'origine d'une pré-réservation.
const CHAMPS_MCP = ['reservePar', 'reserveLe'];

// Écart toléré : aucun. Neuf champs étaient perdus en silence jusqu'à la
// migration 003, qui a appris aux deux RPC à les écrire et à les relire —
// vérifié par un aller-retour contre une réplique du schéma. Cette liste doit
// rester vide : tout champ nouveau sans colonne fait échouer ce test.
const SANS_COLONNE_CONNUS = [];

const snake = (champ) => champ.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);

test('base : aucun champ d’inscription ne perd sa colonne sans qu’on le sache', () => {
  const insc = addInscription(defaultState(), {});
  const champs = [...Object.keys(insc), ...CHAMPS_MCP];
  const sansColonne = champs.filter((c) => !COLONNES.includes(snake(c)));

  assert.deepEqual(sansColonne, SANS_COLONNE_CONNUS,
    'L’écart entre l’application et la base a changé.\n'
    + `  Sans colonne aujourd’hui : ${sansColonne.join(', ') || '(aucun)'}\n`
    + `  Écart déclaré            : ${SANS_COLONNE_CONNUS.join(', ') || '(aucun)'}\n`
    + '  Si vous venez d’ajouter un champ : il faut une colonne ET une mise à\n'
    + '  jour des deux RPC, sinon il sera perdu en silence (docs/SUPABASE.md).\n'
    + '  Si vous venez d’appliquer une migration : retirez-le de cette liste.');
});

test('base : les colonnes existantes couvrent bien les champs essentiels', () => {
  // Filet inverse : si quelqu'un vidait la liste des colonnes, le test
  // ci-dessus passerait en apparence tant que l'écart déclaré suivrait.
  for (const champ of ['stagiaire', 'formation', 'datePratique', 'debutPratique', 'statut']) {
    assert.ok(COLONNES.includes(snake(champ)), `colonne manquante pour ${champ}`);
  }
});
