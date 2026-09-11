// Accès aux RPC du planning partagé.
//
// Le code d'accès (EFI_ACCESS_CODE) ne quitte jamais le serveur : le
// navigateur et le serveur MCP passent tous deux par ce module, jamais par
// Supabase directement.
//
//   efi_load_state(p_code)          → l'état complet, plus un « savedAt »
//   efi_save_state(p_code, p_state) → remplacement transactionnel
//
// Attention : la sauvegarde REMPLACE l'état entier, sans écriture
// conditionnelle. Deux écrivains simultanés s'écrasent donc l'un l'autre.
// Tout appelant qui écrit doit relire juste avant et comparer « savedAt »
// (voir gardeSavedAt plus bas).

import { pickPersisted } from '../js/persisted.js';

const SUPABASE_URL = 'https://eeldkggxvkvpvumwvkca.supabase.co';
const SUPABASE_KEY = 'sb_publishable_6lJ88JCHt4n_lvxQ0UC3qg_c7zz-TV7';

export function accessCode() {
  const code = process.env.EFI_ACCESS_CODE;
  if (!code) {
    const err = new Error('EFI_ACCESS_CODE non configuré côté serveur.');
    err.status = 503;
    throw err;
  }
  return code;
}

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

export function loadState() {
  return rpc('efi_load_state', { p_code: accessCode() });
}

export function saveState(state) {
  return rpc('efi_save_state', { p_code: accessCode(), p_state: pickPersisted(state) });
}

// Garde optimiste : relit l'état et refuse d'écrire si quelqu'un a enregistré
// entre-temps. Ne remplace pas une vraie écriture conditionnelle — la fenêtre
// de collision se réduit à la durée d'une sauvegarde — mais attrape le cas
// courant : une assistante qui modifie le planning pendant qu'un commercial
// pré-réserve.
export async function gardeSavedAt(savedAtAttendu) {
  const frais = await loadState();
  const actuel = frais?.savedAt ?? null;
  if (savedAtAttendu != null && actuel !== savedAtAttendu) {
    const err = new Error('Le planning a été modifié entre-temps. Relancez la recherche : les créneaux proposés ne sont peut-être plus libres.');
    err.status = 409;
    throw err;
  }
  return frais;
}
