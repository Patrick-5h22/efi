// Que laissent réellement passer les deux variables de la connexion Microsoft ?
//
//   node scripts/diag-entra.mjs
//
// LECTURE SEULE, et rien ne sort de la machine : le script lit l'environnement
// courant et n'affiche jamais une valeur entière — forme, longueur, premiers
// caractères.
//
// Il lit l'environnement LOCAL. Pour juger la production, deux chemins :
//
//   vercel env pull .env.production            puis, avec ce fichier chargé :
//   node --env-file=.env.production scripts/diag-entra.mjs
//
// ou, plus simplement, ouvrir /api/diag-entra en étant connecté en
// gestionnaire : la même logique s'y exécute, là où les variables vivent.
//
// Pourquoi ce script existe. Les deux variables échouent vers le PLUS
// PERMISSIF, sans jamais lever d'erreur : tenant absent → « common », groupes
// vides → aucun filtre. Un déploiement grand ouvert est donc indiscernable
// d'un déploiement verrouillé, tant qu'on se contente de constater qu'elles
// sont renseignées. « common » est une valeur renseignée.

import { diagnostiquerEntra } from '../api/_entra-diag.js';

const d = diagnostiquerEntra(process.env);

const BADGES = {
  ok: '✓ OK',
  attention: '⚠ ATTENTION',
  alerte: '✗ ALERTE',
  inactif: '– INACTIF',
};

console.log('\nConnexion Microsoft — ce que les bornes laissent passer\n');
console.log(`  MICROSOFT_TENANT_ID       ${d.tenant.apercu ?? '(absente)'}`);
console.log(`                            ${d.tenant.forme} : ${d.tenant.effet}`);
console.log(`  MICROSOFT_ALLOWED_GROUPS  ${d.groupes.apercus.join(', ') || '(vide)'}`);
console.log(`                            ${d.groupes.effet}`);
console.log(`\n  ${BADGES[d.niveau]} — ${d.resume}\n`);

// Un code de sortie non nul pour que la CI ou un cron puisse s'en saisir ;
// « attention » ne fait pas échouer, c'est un avis, pas un défaut.
process.exit(d.niveau === 'alerte' ? 1 : 0);
