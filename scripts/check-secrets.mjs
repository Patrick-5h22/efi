// Garde-fou : aucun secret ne doit entrer dans ce dépôt public.
//
// Le scan GitHub reconnaît les jetons des grands fournisseurs, pas les
// secrets propres à ce projet. Trois sont en jeu :
//
//   EFI_ACCESS_CODE   code d'accès aux RPC Supabase — variable Vercel
//   MCP_TOKENS        jetons porteurs des commerciaux — variable Vercel
//   js/access.js      gabarit d'auto-connexion, à laisser à null
//
// La clé « publishable » Supabase, elle, est publique par conception : le
// contrôle d'accès est fait côté serveur. Elle est donc explicitement tolérée.
//
//   node scripts/check-secrets.mjs

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const RACINE = new URL('..', import.meta.url).pathname;
const IGNORES = new Set(['node_modules', '.git', '.artefacts', 'screenshots']);
const EXTENSIONS = /\.(js|mjs|cjs|json|ya?ml|md|html|css|txt|env)$/i;

// Ce fichier cite forcément les motifs qu'il traque. C'est la seule
// exemption : exempter un fichier l'aveugle, on préfère affiner les règles.
const EXEMPTS = new Set(['scripts/check-secrets.mjs']);

// Les règles d'affectation s'appliquent au CODE, pas aux commentaires : la
// documentation a le droit de montrer le format attendu. On écarte donc les
// lignes de commentaire, sans chercher à analyser le JavaScript — un préfixe
// suffit, et laisse intactes les chaînes contenant « // » (les URL).
function codeSeul(texte) {
  return texte
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\*|#)/.test(l))
    .join('\n');
}

// Une valeur d'exemple n'est pas un secret. On la reconnaît à ce qu'un vrai
// secret n'aurait jamais : des chevrons (« <jeton1> »), une suite de x ou de
// y, ou un mot de remplissage en tête.
// Mots-clés de configuration ESLint pour déclarer une globale : ce ne sont
// pas des valeurs, mais des niveaux d'accès.
const NIVEAUX_ESLINT = new Set(['writable', 'readonly', 'readable', 'off', 'false', 'true']);

function estGabarit(valeur) {
  // Chaîne interpolée : la valeur vient d'ailleurs, rien n'est écrit en dur.
  if (valeur.includes('${')) return true;
  if (/[<>]/.test(valeur)) return true;
  if (/x{4,}|y{4,}/i.test(valeur)) return true;
  if (NIVEAUX_ESLINT.has(valeur.trim())) return true;
  // Valeur de test explicite. Un vrai secret ne s'annonce pas comme tel ;
  // les règles fortes (clé secrète, clé privée, fichier .env) restent, elles,
  // inconditionnelles.
  if (/\b(test|factice|fictif|fake|dummy|bidon)\b/i.test(valeur)) return true;
  return /^\s*(\.\.\.|…|votre|your|jeton|token|remplacer|exemple)/i.test(valeur);
}

function affectationReelle(texte, cle) {
  const re = new RegExp(`${cle}\\s*[:=]\\s*['"\`]([^'"\`]+)['"\`]`, 'g');
  for (const m of texte.matchAll(re)) {
    if (!estGabarit(m[1])) return true;
  }
  return false;
}

const REGLES = [
  {
    nom: 'code d’accès renseigné dans js/access.js',
    // Doit rester « ?? null ». Toute chaîne littérale est un vrai code.
    test: ({ chemin, code }) => chemin === 'js/access.js'
      && /EFI_ACCESS_CODE\s*=\s*[^;]*['"`][^'"`]+['"`]/.test(code),
    remede: 'js/access.js est un gabarit : laisser « globalThis.EFI_ACCESS_CODE ?? null ».',
  },
  {
    nom: 'affectation littérale de EFI_ACCESS_CODE',
    test: ({ chemin, code }) => chemin !== 'js/access.js'
      && affectationReelle(code, 'EFI_ACCESS_CODE'),
    remede: 'Le code d’accès se lit dans process.env, jamais en clair.',
  },
  {
    nom: 'affectation littérale de MCP_TOKENS',
    test: ({ code }) => affectationReelle(code, 'MCP_TOKENS'),
    remede: 'Les jetons se déclarent dans les variables d’environnement Vercel.',
  },
  {
    nom: 'clé secrète Supabase',
    // sb_secret_… et les clés « service_role » ne doivent jamais apparaître,
    // commentaire compris : leur simple présence est une fuite.
    test: ({ texte }) => /sb_secret_[A-Za-z0-9_-]{8,}/.test(texte)
      || /service_role/.test(texte),
    remede: 'Seule la clé « publishable » peut figurer au dépôt.',
  },
  {
    nom: 'fichier d’environnement',
    test: ({ chemin }) => /(^|\/)\.env(\.|$)/.test(chemin) && !/\.example$/.test(chemin),
    remede: 'Ajouter le fichier à .gitignore et retirer le secret de l’historique.',
  },
  {
    nom: 'clé privée',
    test: ({ texte }) => /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(texte),
    remede: 'Retirer la clé et la faire tourner : elle est compromise.',
  },
];

function* fichiers(dossier) {
  for (const nom of readdirSync(dossier)) {
    if (IGNORES.has(nom)) continue;
    const chemin = join(dossier, nom);
    const info = statSync(chemin);
    if (info.isDirectory()) yield* fichiers(chemin);
    else if (EXTENSIONS.test(nom) && info.size < 2_000_000) yield chemin;
  }
}

const trouvailles = [];
let examines = 0;

for (const chemin of fichiers(RACINE)) {
  const rel = relative(RACINE, chemin).split('\\').join('/');
  if (EXEMPTS.has(rel)) continue;
  examines += 1;
  let texte;
  try {
    texte = readFileSync(chemin, 'utf8');
  } catch {
    continue; // binaire ou illisible
  }
  const contexte = { chemin: rel, texte, code: codeSeul(texte) };
  for (const regle of REGLES) {
    if (regle.test(contexte)) trouvailles.push({ rel, regle });
  }
}

if (trouvailles.length) {
  console.error(`✗ ${trouvailles.length} secret(s) potentiel(s) dans le dépôt :\n`);
  for (const { rel, regle } of trouvailles) {
    console.error(`  ${rel}`);
    console.error(`    ${regle.nom}`);
    console.error(`    → ${regle.remede}\n`);
  }
  console.error('Aucun de ces éléments ne doit être versionné : ce dépôt est public.');
  process.exit(1);
}

console.log(`✓ aucun secret détecté (${examines} fichiers examinés, ${REGLES.length} règles)`);
