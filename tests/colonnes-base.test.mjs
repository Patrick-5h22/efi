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

// ---------------------------------------------------------------------------
// Les inscriptions n'étaient pas seules concernées
//
// Ce fichier ne surveillait que planning.inscriptions, et c'est ainsi qu'une
// perte est passée : les RPC de la migration 003 n'écrivaient ni ne relisaient
// « testOnly » et « chargeComptee » des formations. Une formation du catalogue
// s'en sortait par accident — migrate() réinjecte le drapeau pour l'AIPR qu'il
// connaît — mais une formation créée à la main dans l'écran Paramètres perdait
// le sien au premier aller-retour : une épreuve surveillée redevenait une
// formation ordinaire, avec un formateur mobilisé et un test à programmer.
//
// Mesuré sur une réplique du schéma : avec les RPC de la 003 seule, les quatre
// champs revenaient PERDUS ; avec la 004, tous reviennent.
// ---------------------------------------------------------------------------

const COLONNES_FORMATIONS = [
  'code', 'label', 'reco', 'duree_initial', 'duree_recyclage', 'tests', 'capacite', 'position',
  // Ajoutées par la migration 004
  'test_only', 'charge_comptee',
  // Ajoutées par la migration 005
  'duree_test', 'test_surveille',
];

const COLONNES_TEAM = [
  'id', 'name', 'quals', 'position',
  // Ajoutées par la migration 004
  'dispo_debut', 'dispo_fin',
];

test('base : aucun champ de formation ne perd sa colonne sans qu’on le sache', () => {
  const champs = new Set(defaultState().formations.flatMap((f) => Object.keys(f)));
  const sansColonne = [...champs].filter((c) => !COLONNES_FORMATIONS.includes(snake(c)));
  assert.deepEqual(sansColonne, [],
    `Champs de formation sans colonne : ${sansColonne.join(', ')}\n`
    + '  Il faut une colonne ET une mise à jour des deux RPC (docs/SUPABASE.md).');
});

test('base : aucun champ d’intervenant ne perd sa colonne sans qu’on le sache', () => {
  const state = defaultState();
  // La fenêtre de disponibilité n'est posée qu'à la saisie : on la force ici
  // pour que le champ existe même sur une équipe d'exemple.
  const champs = new Set(state.team.flatMap((m) => Object.keys({ dispoDebut: null, dispoFin: null, ...m })));
  const sansColonne = [...champs].filter((c) => !COLONNES_TEAM.includes(snake(c)));
  assert.deepEqual(sansColonne, [],
    `Champs d’intervenant sans colonne : ${sansColonne.join(', ')}\n`
    + '  Il faut une colonne ET une mise à jour des deux RPC (docs/SUPABASE.md).');
});
