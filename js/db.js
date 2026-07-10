// Synchronisation avec la base partagée Supabase (schéma « planning » du
// projet efi-placement). L'accès passe exclusivement par deux fonctions RPC
// protégées par un code d'accès ; la clé publishable ci-dessous est publique
// par conception (le contrôle d'accès est fait côté serveur).

export const SUPABASE_URL = 'https://eeldkggxvkvpvumwvkca.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_6lJ88JCHt4n_lvxQ0UC3qg_c7zz-TV7';

const CODE_KEY = 'efi-cloud-code';

// Code d'accès : celui saisi sur le poste, sinon celui injecté au déploiement
// (js/access.js, généré par le workflow Vercel à partir d'un secret GitHub —
// le fichier du dépôt est un gabarit vide).
export function getAccessCode(storage) {
  return storage.getItem(CODE_KEY) || globalThis.EFI_ACCESS_CODE || null;
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
// Synchroniseur permanent :
//  - sauvegarde distante « debounced » après chaque commit ;
//  - interrogation périodique de la base pour récupérer les modifications
//    faites depuis un autre poste (connexion permanente) ;
//  - reprise automatique après coupure réseau, sauvegarde forcée à la sortie.
// ---------------------------------------------------------------------------
export const POLL_INTERVAL_MS = 45_000;
const RETRY_INTERVAL_MS = 20_000;

export function createSyncer({ getState, onStatus, onRemoteChange }) {
  let timer = null;
  let pollTimer = null;
  let pending = false;
  let inFlight = false;
  let status = 'off'; // off | idle | saving | error
  let lastSavedAt = null; // horodatage distant connu (détection de changement)

  const set = (s, detail) => { status = s; onStatus(s, detail); };

  const flush = async () => {
    const code = getAccessCode(localStorage);
    if (!code) { set('off'); return; }
    pending = false;
    inFlight = true;
    set('saving');
    try {
      const res = await saveRemoteState(code, getState());
      lastSavedAt = res.savedAt || lastSavedAt;
      if (!pending) set('idle');
    } catch (e) {
      set('error', e.message);
    } finally {
      inFlight = false;
    }
  };

  // Un tour d'interrogation : récupère l'état distant et signale tout
  // changement fait ailleurs. Sans effet si une sauvegarde est en cours
  // ou en attente (nos modifications priment, elles vont écraser).
  const poll = async () => {
    const code = getAccessCode(localStorage);
    if (!code || pending || inFlight || document.hidden) return;
    try {
      const remote = await loadRemoteState(code);
      const remoteAt = remote.savedAt || null;
      if (lastSavedAt == null) {
        lastSavedAt = remoteAt;
      } else if (remoteAt && remoteAt !== lastSavedAt) {
        // onRemoteChange peut refuser (ex. saisie en cours) : on ne mémorise
        // l'horodatage que si le changement a bien été appliqué, pour le
        // représenter au tour suivant.
        const applied = onRemoteChange?.(remote);
        if (applied !== false) lastSavedAt = remoteAt;
      }
      if (status === 'error') set('idle'); // reprise après coupure
    } catch (e) {
      if (status !== 'error') set('error', e.message);
    }
  };

  const startPolling = () => {
    stopPolling();
    pollTimer = setInterval(poll, POLL_INTERVAL_MS);
  };
  const stopPolling = () => { clearInterval(pollTimer); pollTimer = null; };

  // Reprise réseau + sauvegarde de secours à la fermeture de l'onglet
  window.addEventListener('online', () => { if (pending) flush(); else poll(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) poll();
    else if (pending) flush();
  });
  window.addEventListener('pagehide', () => { if (pending) flush(); });
  // Nouvelle tentative périodique tant qu'une sauvegarde a échoué
  setInterval(() => { if (status === 'error' && pending) flush(); }, RETRY_INTERVAL_MS);

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
    poll,
    startPolling,
    stopPolling,
    setStatus: set,
    seenSavedAt(at) { lastSavedAt = at || lastSavedAt; },
  };
}
