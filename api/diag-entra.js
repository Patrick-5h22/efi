// Diagnostic des bornes de la connexion Microsoft, rendu là où les variables
// existent réellement — c'est-à-dire sur le serveur.
//
//   GET /api/diag-entra   → { niveau, resume, tenant, groupes }
//
// Pourquoi une route et pas seulement un script. MICROSOFT_TENANT_ID et
// MICROSOFT_ALLOWED_GROUPS vivent dans l'environnement Vercel : une machine de
// développement ne les voit pas, et les recopier pour les vérifier est
// exactement ce qu'on cherche à éviter. La même logique est aussi offerte en
// ligne de commande (scripts/diag-entra.mjs) pour qui les a localement.
//
// Réservé aux GESTIONNAIRES. La route ne rend aucune valeur — forme, longueur
// et premiers caractères seulement — mais elle décrit tout de même la posture
// de sécurité du déploiement : ce n'est pas une page d'accueil.

import { sessionDeLaRequete } from './_auth.js';
import { diagnostiquerEntra } from './_entra-diag.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Méthode non autorisée.' });
  }
  try {
    // Dans le try, comme /api/prefs : base d'authentification injoignable → 503,
    // et non 500 avec la trace de better-auth.
    const session = await sessionDeLaRequete(req);
    if (!session) {
      return res.status(401).json({ message: 'Authentification requise.' });
    }
    if (session.user.role !== 'gestionnaire') {
      return res.status(403).json({ message: 'Réservé aux gestionnaires.' });
    }
    return res.status(200).json(diagnostiquerEntra(process.env));
  } catch (e) {
    return res.status(e.status || 500).json({ message: e.message });
  }
}
