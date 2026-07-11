// Préférences utilisateur. Toujours mémorisées sur le poste (localStorage) ;
// en mode connecté (API), également enregistrées sur le profil utilisateur
// (table planning.user_prefs via /api/prefs) : on les retrouve sur tout poste.

import { isApiMode } from './db.js';
import { OCCUPATION_SCOPES } from './engine.js';

const SCOPE_KEY = 'efi-kpi-scope';
let scope = null;

export function getKpiScope(storage = localStorage) {
  if (scope == null) {
    const saved = storage.getItem(SCOPE_KEY);
    scope = OCCUPATION_SCOPES.includes(saved) ? saved : 'periode';
  }
  return scope;
}

export function setKpiScope(next, storage = localStorage) {
  if (!OCCUPATION_SCOPES.includes(next)) return;
  scope = next;
  storage.setItem(SCOPE_KEY, next);
  if (isApiMode()) {
    // Meilleure-chance : la préférence locale reste valable si l'appel échoue
    fetch('/api/prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kpiScope: next }),
    }).catch(() => {});
  }
}

// Au démarrage d'une session connectée : la préférence du profil prime sur
// celle du poste. Renvoie true si la valeur locale a changé (re-rendu utile).
export async function loadRemotePrefs(storage = localStorage) {
  if (!isApiMode()) return false;
  try {
    const res = await fetch('/api/prefs');
    if (!res.ok) return false;
    const prefs = await res.json();
    if (OCCUPATION_SCOPES.includes(prefs.kpiScope) && prefs.kpiScope !== getKpiScope(storage)) {
      scope = prefs.kpiScope;
      storage.setItem(SCOPE_KEY, prefs.kpiScope);
      return true;
    }
  } catch { /* hors ligne : préférence locale conservée */ }
  return false;
}
