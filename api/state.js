// Accès au planning partagé, réservé aux utilisateurs authentifiés.
//
// Le navigateur ne parle plus directement à Supabase : il appelle ce proxy,
// qui vérifie la session Better Auth puis relaie vers les RPC planning avec
// le code d'accès EFI_ACCESS_CODE — lequel ne quitte jamais le serveur.
//
//   GET /api/state          → efi_load_state  (état complet du planning)
//   PUT /api/state  {state} → efi_save_state  (remplacement transactionnel)

import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './_auth.js';
import { loadState, saveState } from './_planning.js';

export default async function handler(req, res) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user) {
    return res.status(401).json({ message: 'Authentification requise.' });
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await loadState());
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const state = req.body;
      if (!state || typeof state !== 'object') {
        return res.status(400).json({ message: 'Corps de requête invalide.' });
      }
      // saveState ne relaie que les champs persistés — liste dans js/persisted.js
      return res.status(200).json(await saveState(state));
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ message: 'Méthode non autorisée.' });
  } catch (e) {
    // Erreur amont (Supabase ou configuration) → 502/503, sinon 500
    const status = e.status === 503 ? 503 : e.status ? 502 : 500;
    return res.status(status).json({ message: e.message });
  }
}
