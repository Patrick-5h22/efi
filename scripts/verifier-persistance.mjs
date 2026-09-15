// Que garde réellement la base partagée ?
//
//   EFI_ACCESS_CODE='…' node scripts/verifier-persistance.mjs
//
// LECTURE SEULE : ce script n'écrit rien. Il interroge efi_load_state et fait
// l'inventaire de ce que la base rend, champ par champ.
//
// Pourquoi il existe. Le schéma Supabase est RELATIONNEL (planning.params,
// planning.inscriptions, …) : c'est le corps des RPC — hors de ce dépôt — qui
// décide des colonnes conservées. Un champ ajouté côté navigateur peut donc
// être accepté sans erreur et perdu en silence, et nos tests ne le verraient
// pas : ils remplacent Supabase par un faux qui garde tout ce qu'on lui donne.
//
// C'est exactement ce qui est arrivé à « dayPresence » (#34), corrigé côté
// navigateur sans que personne ne vérifie la base ; et c'est le soupçon qui
// pèse sur « chiffreAffaires ».
//
// Ce que le script ne peut pas faire : deviner pourquoi un champ manque. Il
// dit ce qui manque — au vu des données réelles — et c'est ce qu'il faut pour
// décider s'il faut une migration SQL ou une correction de code.

import { PERSISTED_FIELDS } from '../js/persisted.js';

const SUPABASE_URL = 'https://eeldkggxvkvpvumwvkca.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6lJ88JCHt4n_lvxQ0UC3qg_c7zz-TV7';

// Champs d'une inscription qui ne sont ni obligatoires ni recalculés : ceux
// qu'une colonne manquante ferait disparaître sans bruit.
const CHAMPS_LIGNE = [
  'stagiaire', 'formation', 'type', 'statut',
  'dossierYpareo', 'chiffreAffaires', 'entreprise', 'siret',
  'datePratique', 'debutPratique', 'dateTheorie', 'dateTestPratique',
  'debutTestPratique', 'formateurId', 'testeurId',
  'modeTheorie', 'dateTheorieFormation', 'debutTheorieFormation',
  'dureeTheorieCentre', 'formateurTheorieId',
  'reservePar', 'reserveLe', 'motifAnnulation',
];

const code = process.env.EFI_ACCESS_CODE;
if (!code) {
  console.error('\n✗ EFI_ACCESS_CODE manquant.\n');
  console.error('  Le code d’accès ne doit pas entrer dans le dépôt : passez-le à l’appel.');
  console.error('    EFI_ACCESS_CODE=\'…\' node scripts/verifier-persistance.mjs\n');
  process.exit(2);
}

const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/efi_load_state`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
  },
  body: JSON.stringify({ p_code: code }),
});

if (!res.ok) {
  let message = `HTTP ${res.status}`;
  try { message = (await res.json()).message || message; } catch { /* non JSON */ }
  console.error(`\n✗ Lecture refusée : ${message}\n`);
  process.exit(1);
}

const etat = await res.json();
const inscriptions = Array.isArray(etat?.inscriptions) ? etat.inscriptions : [];

console.log('\nCe que la base rend\n');
console.log(`  savedAt : ${etat?.savedAt ?? '(absent)'}`);
console.log(`  ${inscriptions.length} inscription(s)\n`);

console.log('Champs de premier niveau attendus (js/persisted.js)\n');
let manquants = 0;
for (const champ of PERSISTED_FIELDS) {
  const v = etat?.[champ];
  const absent = v === undefined;
  const vide = !absent && (Array.isArray(v) ? v.length === 0
    : (v && typeof v === 'object' ? Object.keys(v).length === 0 : v == null));
  if (absent) manquants += 1;
  const etatChamp = absent ? '✗ ABSENT' : (vide ? '· vide  ' : '✓ présent');
  const detail = Array.isArray(v) ? `${v.length} élément(s)`
    : (v && typeof v === 'object' ? `${Object.keys(v).length} clé(s)` : '');
  console.log(`  ${etatChamp}  ${champ}${detail ? ` — ${detail}` : ''}`);
}

console.log('\nChamps des inscriptions — lignes qui en portent une valeur\n');
for (const champ of CHAMPS_LIGNE) {
  const cleAbsente = inscriptions.length > 0 && inscriptions.every((i) => !(champ in i));
  const renseignes = inscriptions.filter((i) => i[champ] !== null && i[champ] !== undefined && i[champ] !== '').length;
  // Trois états distincts, et le second ne vaut pas accusation : une RPC peut
  // très bien omettre les valeurs nulles de son JSON.
  const marque = renseignes ? '✓' : (cleAbsente ? '?' : '·');
  const note = renseignes ? '' : (cleAbsente ? '  (clé absente du JSON)' : '  (aucune valeur)');
  console.log(`  ${marque}  ${champ} : ${renseignes}/${inscriptions.length}${note}`);
}

console.log('\nComment lire ce rapport\n');
console.log('  Le seul verdict fiable est la confrontation avec ce que vous avez saisi.');
console.log('  Un champ que vous avez renseigné dans l’application et qui ressort ici à');
console.log('  0/N : la base ne le conserve pas — il manque une colonne, ou la RPC ne la');
console.log('  lit pas. Une migration SQL est alors nécessaire, le dépôt n’y peut rien.');
console.log('  « clé absente du JSON » seul ne prouve rien : une RPC peut omettre les');
console.log('  valeurs nulles. « ABSENT » sur un champ de premier niveau, en revanche,');
console.log('  est net : l’application l’envoie, la base ne le rend pas.\n');

if (manquants) {
  console.log(`✗ ${manquants} champ(s) de premier niveau absent(s) de la base.\n`);
  process.exit(1);
}
console.log('✓ Tous les champs de premier niveau sont rendus par la base.\n');
