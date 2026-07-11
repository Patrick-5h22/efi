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

const SUPABASE_URL = 'https://eeldkggxvkvpvumwvkca.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6lJ88JCHt4n_lvxQ0UC3qg_c7zz-TV7';

async function rpc(name, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
    body: JSON.stringify(args),
  });
  if (!res.ok) {
    let message = `Erreur Supabase ${res.status}`;
    try {
      const body = await res.json();
      if (body.message) message = body.message;
    } catch { /* réponse non JSON */ }
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

export default async function handler(req, res) {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user) {
    return res.status(401).json({ message: 'Authentification requise.' });
  }

  const code = process.env.EFI_ACCESS_CODE;
  if (!code) {
    return res.status(503).json({ message: 'EFI_ACCESS_CODE non configuré côté serveur.' });
  }

  try {
    if (req.method === 'GET') {
      return res.status(200).json(await rpc('efi_load_state', { p_code: code }));
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      const state = req.body;
      if (!state || typeof state !== 'object') {
        return res.status(400).json({ message: 'Corps de requête invalide.' });
      }
      // On ne relaie que les champs persistés
      const { params, formations, team, openDays, dayAssignments, inscriptions } = state;
      return res.status(200).json(await rpc('efi_save_state', {
        p_code: code,
        p_state: { params, formations, team, openDays, dayAssignments, inscriptions },
      }));
    }
    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).json({ message: 'Méthode non autorisée.' });
  } catch (e) {
    // Erreur amont (Supabase) → 502, sinon 500
    return res.status(e.status ? 502 : 500).json({ message: e.message });
  }
}
