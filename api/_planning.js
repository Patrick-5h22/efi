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
// Tout appelant qui écrit doit relire juste avant et comparer le contenu
// (voir relireSiModifie plus bas).
//
// « savedAt » ne sert PAS à cela. La RPC le rendait avec « now() » : deux
// lectures consécutives n'en portaient jamais le même, et cette garde y voyait
// un conflit permanent — plus aucune pré-réservation ne pouvait aboutir. La
// migration 003 rend désormais l'horodatage de la dernière écriture, mais on
// continue de comparer le CONTENU : il ne dépend d'aucune horloge, d'aucune
// convention de fuseau, et d'aucune version de la base.

import { pickPersisted, empreintePersistee } from '../js/persisted.js';

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

// Relit l'état juste avant d'écrire et rend la version fraîche si le contenu a
// changé depuis la lecture de départ, « null » sinon.
//
// Ne remplace pas une vraie écriture conditionnelle — la fenêtre de collision
// se réduit à la durée d'une sauvegarde — mais attrape le cas courant : une
// assistante qui modifie le planning pendant qu'un commercial pré-réserve.
// Comme la sauvegarde remplace l'état entier, écrire par-dessus effacerait sa
// modification : à l'appelant de recalculer sur l'état rendu ici.
export async function relireSiModifie(etatLu) {
  const frais = await loadState();
  return empreintePersistee(frais) === empreintePersistee(etatLu) ? null : frais;
}

export function conflitEcriture() {
  const err = new Error('Le planning a été modifié entre-temps. Relancez la recherche : les créneaux proposés ne sont peut-être plus libres.');
  err.status = 409;
  return err;
}
