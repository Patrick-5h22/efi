// Synchronisation avec la base partagée Supabase (schéma « planning » du
// projet efi-placement). L'accès passe exclusivement par deux fonctions RPC
// protégées par un code d'accès ; la clé publishable ci-dessous est publique
// par conception (le contrôle d'accès est fait côté serveur).

export const SUPABASE_URL = 'https://eeldkggxvkvpvumwvkca.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_6lJ88JCHt4n_lvxQ0UC3qg_c7zz-TV7';

const CODE_KEY = 'efi-cloud-code';

export function getAccessCode(storage) {
  return storage.getItem(CODE_KEY) || null;
}

export function setAccessCode(storage, code) {
  if (code) storage.setItem(CODE_KEY, code);
  else storage.removeItem(CODE_KEY);
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
    let message = `Erreur ${res.status}`;
    try {
      const body = await res.json();
      if (body.message) message = body.message;
    } catch { /* réponse non JSON */ }
    const err = new Error(message);
    err.status = res.status;
    err.badCode = res.status === 403 || /code d.acc/i.test(message);
    throw err;
  }
  return res.json();
}

export function loadRemoteState(code) {
  return rpc('efi_load_state', { p_code: code });
}

export function saveRemoteState(code, state) {
  // On n'envoie que les champs persistés (pas de dérivés)
  const { params, formations, team, openDays, dayAssignments, inscriptions } = state;
  return rpc('efi_save_state', {
    p_code: code,
    p_state: { params, formations, team, openDays, dayAssignments, inscriptions },
  });
}

// ---------------------------------------------------------------------------
// Synchroniseur : sauvegarde distante « debounced » après chaque commit,
// avec état observable pour l'indicateur de la barre latérale.
// ---------------------------------------------------------------------------
export function createSyncer({ getState, onStatus }) {
  let timer = null;
  let pending = false;
  let status = 'off'; // off | idle | saving | error

  const set = (s, detail) => { status = s; onStatus(s, detail); };

  const flush = async () => {
    const code = getAccessCode(localStorage);
    if (!code) { set('off'); return; }
    pending = false;
    set('saving');
    try {
      await saveRemoteState(code, getState());
      if (!pending) set('idle');
    } catch (e) {
      set('error', e.message);
    }
  };

  return {
    get status() { return status; },
    enabled: () => !!getAccessCode(localStorage),
    schedule() {
      if (!getAccessCode(localStorage)) return;
      pending = true;
      clearTimeout(timer);
      timer = setTimeout(flush, 800);
    },
    flush,
    setStatus: set,
  };
}
