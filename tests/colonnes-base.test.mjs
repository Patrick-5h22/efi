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

// Relevé de planning.inscriptions au 15/09/2026 (information_schema.columns).
// À mettre à jour en même temps que toute migration SQL.
const COLONNES = [
  'id', 'stagiaire', 'formation', 'type',
  'date_pratique', 'debut_pratique', 'date_theorie',
  'date_test_pratique', 'debut_test_pratique',
  'formateur_id', 'testeur_id', 'updated_at',
  'entreprise', 'siret', 'statut', 'motif_annulation',
];

// Champs posés par le serveur MCP (js/mcp.js) et non par addInscription :
// la trace de l'origine d'une pré-réservation.
const CHAMPS_MCP = ['reservePar', 'reserveLe'];

// Écart CONNU, constaté le 15/09/2026 : ces champs n'ont pas de colonne et
// sont perdus à chaque sauvegarde. docs/migrations/002-colonnes-inscriptions.sql
// ajoute les colonnes ; la 003 devra apprendre aux deux RPC à les lire et à
// les écrire. Cette liste doit se VIDER à ce moment-là — et le test échouera
// tant qu'elle ne correspondra plus à la réalité, dans un sens comme dans
// l'autre.
const SANS_COLONNE_CONNUS = [
  'dossierYpareo',
  'chiffreAffaires',
  'modeTheorie',
  'dateTheorieFormation',
  'debutTheorieFormation',
  'dureeTheorieCentre',
  'formateurTheorieId',
  'reservePar',
  'reserveLe',
];

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
