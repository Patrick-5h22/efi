// Point d'entrée de l'application : état global, routeur, rendu.

import { loadState, saveState, defaultState, seedExamples, exportJSON, importJSON, migrate } from './store.js';
import { createSyncer, loadRemoteState, getAccessCode, setAccessCode, setApiMode, isApiMode } from './db.js';
import { detectAuth, signIn, signOut } from './auth-client.js';
import { loadRemotePrefs } from './prefs.js';
import { showLoginOverlay } from './views/login.js';
import { applyTheme, watchSystemTheme, setupThemeMenu, setTheme, THEME_PRESETS } from './theme.js';
import { setupCommandPalette, openCommandPalette } from './views/command.js';
import { computeSchedule } from './engine.js';
import { periodWeeks } from './dates.js';
import { renderDashboard } from './views/dashboard.js';
import { renderInscriptions } from './views/inscriptions.js';
import { renderSemaine } from './views/semaine.js';
import { renderStagiaires } from './views/stagiaires.js';
import { renderSynthese } from './views/synthese.js';
import { renderPlanning } from './views/planning.js';
import { renderEquipe } from './views/equipe.js';
import { renderJours } from './views/jours.js';
import { renderParametres } from './views/parametres.js';
import { renderAide } from './views/aide.js';

// ---------------------------------------------------------------------------
// État global
// ---------------------------------------------------------------------------
const HISTORY_MAX = 50;

export const app = {
  state: null,
  schedule: null, // résultat de computeSchedule, recalculé à chaque mutation
  undoStack: [],
  redoStack: [],
  snapshot: null, // état sérialisé AVANT la mutation en cours
  save() {
    saveState(localStorage, this.state);
    this.schedule = computeSchedule(this.state);
  },
  syncer: null,
  commit() {
    // mutation + historique + sauvegarde + re-rendu
    if (this.snapshot != null) {
      this.undoStack.push(this.snapshot);
      if (this.undoStack.length > HISTORY_MAX) this.undoStack.shift();
      this.redoStack = [];
    }
    this.save();
    this.snapshot = JSON.stringify(this.state);
    this.syncer?.schedule();
    render();
  },
  undo() {
    if (!this.undoStack.length) return toast('Rien à annuler.');
    this.redoStack.push(JSON.stringify(this.state));
    this.state = JSON.parse(this.undoStack.pop());
    this.save();
    this.snapshot = JSON.stringify(this.state);
    this.syncer?.schedule();
    render();
    toast('Action annulée.', 'ok');
  },
  redo() {
    if (!this.redoStack.length) return toast('Rien à rétablir.');
    this.undoStack.push(JSON.stringify(this.state));
    this.state = JSON.parse(this.redoStack.pop());
    this.save();
    this.snapshot = JSON.stringify(this.state);
    this.syncer?.schedule();
    render();
    toast('Action rétablie.', 'ok');
  },
};

function boot() {
  let state = loadState(localStorage);
  if (!state) {
    state = seedExamples(defaultState());
    saveState(localStorage, state);
  }
  app.state = state;
  app.schedule = computeSchedule(state);
  app.snapshot = JSON.stringify(state);
}

// --- Base partagée (Supabase) ----------------------------------------------
function setCloudStatus(status, detail) {
  const el = document.getElementById('cloud-status');
  if (!el) return;
  const labels = {
    off: ['☁', 'Base partagée non connectée — cliquer pour saisir le code d’accès'],
    idle: ['☁✓', 'Base partagée synchronisée' + (detail ? ' — ' + detail : '')],
    saving: ['☁…', 'Sauvegarde vers la base partagée…'],
    error: ['☁⚠', 'Erreur de synchronisation : ' + (detail || 'inconnue')],
  };
  const [icon, title] = labels[status] || labels.off;
  el.textContent = icon;
  el.title = title;
  el.dataset.status = status;
}

async function connectCloud(code, { silent = false } = {}) {
  try {
    const remote = await loadRemoteState(code);
    setAccessCode(localStorage, code);
    app.syncer.seenSavedAt(remote.savedAt);
    applyRemoteState(remote);
    app.syncer.setStatus('idle');
    app.syncer.startPolling();
    if (!silent) toast('Connecté à la base partagée — planning chargé.', 'ok');
  } catch (e) {
    if (e.badCode) {
      setAccessCode(localStorage, null);
      if (!silent) toast('Code d’accès refusé.', 'error');
      app.syncer.setStatus('off');
    } else {
      if (!silent) toast('Base partagée injoignable : ' + e.message + ' — mode local conservé.', 'error');
      app.syncer.setStatus('error', e.message);
      app.syncer.startPolling(); // retentera et se reconnectera dès le retour du réseau
    }
  }
}

// Remplace l'état local par l'état distant (modification venue d'un autre poste)
function applyRemoteState(remote) {
  app.state = migrate(structuredClone(remote));
  app.save();
  app.snapshot = JSON.stringify(app.state);
  app.undoStack = [];
  app.redoStack = [];
  render();
}

// --- Authentification (Better Auth, site déployé) ---------------------------
function setUserZone(user) {
  const zone = document.getElementById('user-zone');
  if (!zone) return;
  if (user) {
    zone.hidden = false;
    document.getElementById('user-name').textContent = user.name || user.email;
    zone.title = `Connecté : ${user.email}${user.role ? ' (' + user.role + ')' : ''}`;
  } else {
    zone.hidden = true;
    document.getElementById('user-name').textContent = '';
  }
}

// Erreur renvoyée par le fournisseur externe (retour OAuth : ?error=… dans
// l'URL) : consommée une fois, affichée sur l'écran de connexion.
function consumeAuthError() {
  const err = new URLSearchParams(location.search).get('error');
  if (!err) return null;
  history.replaceState(null, '', location.pathname + location.hash);
  const messages = {
    forbidden: 'Connexion Microsoft refusée : votre compte n’appartient à aucun groupe autorisé.',
    signup_disabled: 'Connexion refusée : aucun compte associé et l’inscription est désactivée.',
    access_denied: 'Connexion Microsoft annulée.',
  };
  return messages[err] || 'Connexion Microsoft refusée (' + err + ').';
}

function requestLogin(error) {
  showLoginOverlay({
    error,
    onLogin: async (email, password) => {
      await signIn(email, password);
      const det = await detectAuth();
      if (!det.session) throw Object.assign(new Error('Session introuvable après connexion.'), { status: 500 });
      await startApiSession(det.session);
    },
  });
}

// Session Better Auth active : chargement du planning via le proxy /api/state
async function startApiSession(session, { silent = false } = {}) {
  setUserZone(session.user);
  // Thème préféré du compte (partagé avec EFI Placement), sauf choix local déjà fait
  const preset = session.user.theme;
  if (preset && !localStorage.getItem('efi-theme') && THEME_PRESETS.some((p) => p.id === preset)) {
    setTheme({ preset });
  }
  try {
    const remote = await loadRemoteState(null);
    app.syncer.seenSavedAt(remote.savedAt);
    applyRemoteState(remote);
    app.syncer.setStatus('idle');
    app.syncer.startPolling();
    // Préférences du profil (portée de la carte d'occupation, …)
    loadRemotePrefs().then((changed) => { if (changed) render(); });
    if (!silent) toast(`Bienvenue ${session.user.name || session.user.email} — planning chargé.`, 'ok');
  } catch (e) {
    if (e.authExpired) return requestLogin();
    toast('Base partagée injoignable : ' + e.message + ' — mode local conservé.', 'error');
    app.syncer.setStatus('error', e.message);
    app.syncer.startPolling();
  }
}

async function logout() {
  if (!confirm('Se déconnecter ?')) return;
  if (app.syncer.pending) await app.syncer.flush(); // ne pas perdre une sauvegarde en attente
  await signOut();
  app.syncer.stopPolling();
  app.syncer.setStatus('off');
  setUserZone(null);
  toast('Déconnecté.', 'ok');
  requestLogin();
}

async function setupCloud() {
  app.syncer = createSyncer({
    getState: () => app.state,
    onStatus: setCloudStatus,
    onRemoteChange: (remote) => {
      // Ne pas écraser un formulaire en cours de saisie : réappliqué au tour suivant
      if (document.querySelector('dialog[open]')) return false;
      applyRemoteState(remote);
      toast('Planning mis à jour depuis la base partagée.', 'ok');
      return true;
    },
    onAuthError: () => {
      setUserZone(null);
      toast('Session expirée — reconnectez-vous.', 'error');
      requestLogin();
    },
  });
  document.getElementById('cloud-status').addEventListener('click', async () => {
    if (isApiMode()) {
      toast('Base partagée via votre compte — utilisez « Se déconnecter » pour quitter.', 'ok');
      return;
    }
    const current = getAccessCode(localStorage);
    if (current) {
      if (confirm('Se déconnecter de la base partagée ? (les données restent en local)')) {
        setAccessCode(localStorage, null);
        app.syncer.setStatus('off');
        toast('Déconnecté — les modifications restent locales.', 'ok');
      }
      return;
    }
    const code = prompt('Code d’accès de la base partagée EFI :');
    if (code?.trim()) await connectCloud(code.trim());
  });
  document.getElementById('btn-logout')?.addEventListener('click', logout);

  // Site déployé avec fonctions serverless → authentification obligatoire ;
  // hébergement statique (poste local…) → mode historique par code d'accès.
  const authError = consumeAuthError();
  const det = await detectAuth();
  if (det.available) {
    setApiMode(true);
    if (det.session) startApiSession(det.session, { silent: true });
    else requestLogin(authError);
    return;
  }
  // Connexion permanente : code du poste, sinon code injecté au déploiement
  const code = getAccessCode(localStorage);
  if (code) connectCloud(code, { silent: !!globalThis.EFI_ACCESS_CODE && !localStorage.getItem('efi-cloud-code') });
}

// ---------------------------------------------------------------------------
// Utilitaires DOM partagés
// ---------------------------------------------------------------------------
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function toast(msg, kind = '') {
  const zone = document.getElementById('toast-zone');
  const el = document.createElement('div');
  el.className = `toast ${kind ? 'toast-' + kind : ''}`;
  el.textContent = msg;
  zone.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ---------------------------------------------------------------------------
// Routeur
// ---------------------------------------------------------------------------
const routes = {
  '': renderDashboard,
  'dashboard': renderDashboard,
  'inscriptions': renderInscriptions,
  'semaine': renderSemaine,
  'stagiaires': renderStagiaires,
  'synthese': renderSynthese,
  'planning-formateur': (m, a) => renderPlanning(m, a, 'F'),
  'planning-testeur': (m, a) => renderPlanning(m, a, 'T'),
  'equipe': renderEquipe,
  'jours': renderJours,
  'parametres': renderParametres,
  'aide': renderAide,
};

export function currentRoute() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [page, ...rest] = hash.split('/');
  return { page: page || 'dashboard', args: rest };
}

export function navigate(path) {
  location.hash = '#/' + path;
}

function renderNav() {
  const { page, args } = currentRoute();
  const errorCount = app.schedule.rows.filter((r) => r.errors.length).length;
  const weeks = periodWeeks(app.state.params);
  const currentWeek = page === 'semaine' ? Number(args[0]) : null;

  const link = (path, label, active) =>
    `<a href="#/${path}" class="${active ? 'active' : ''}" ${active ? 'aria-current="page"' : ''}>${label}</a>`;

  document.getElementById('nav').innerHTML = `
    ${link('dashboard', '🏠 Tableau de bord', page === 'dashboard')}
    ${link('inscriptions', `📝 Inscriptions ${errorCount ? `<span class="nav-badge">${errorCount}</span>` : ''}`, page === 'inscriptions')}
    ${link('stagiaires', '🗂 Dossiers', page === 'stagiaires')}
    ${link('synthese', '📋 Synthèse semaine', page === 'synthese')}
    <div class="nav-section">Plannings</div>
    ${link(`semaine/${currentWeek || weeks[0].week}`, '🗓 Grilles semaine', page === 'semaine')}
    ${link('planning-formateur', '👷 Planning formateur', page === 'planning-formateur')}
    ${link('planning-testeur', '🔎 Planning testeur', page === 'planning-testeur')}
    <div class="nav-section">Configuration</div>
    ${link('equipe', '👥 Équipe', page === 'equipe')}
    ${link('jours', '📆 Jours EFI', page === 'jours')}
    ${link('parametres', '⚙️ Paramètres', page === 'parametres')}
    ${link('aide', '❓ Mode d’emploi', page === 'aide')}
  `;
}

export function render() {
  const { page, args } = currentRoute();
  const fn = routes[page] || renderDashboard;
  const main = document.getElementById('main');
  main.innerHTML = '';
  fn(main, args);
  renderNav();
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------
function setupImportExport() {
  document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([exportJSON(app.state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `efi-planning-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Données exportées.', 'ok');
  });
  const fileInput = document.getElementById('file-import');
  document.getElementById('btn-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      app.state = importJSON(text);
      app.commit();
      toast('Sauvegarde importée.', 'ok');
    } catch (e) {
      toast('Import impossible : ' + e.message, 'error');
    }
    fileInput.value = '';
  });
}

// ---------------------------------------------------------------------------
boot();
applyTheme();
watchSystemTheme();
setupThemeMenu(document.getElementById('theme-btn'), esc);
setupCommandPalette();
document.getElementById('cmdk-btn').addEventListener('click', openCommandPalette);
setupImportExport();
setupCloud();
document.getElementById('btn-undo').addEventListener('click', () => app.undo());
document.getElementById('btn-redo').addEventListener('click', () => app.redo());
window.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.target.closest('input, textarea, select, dialog')) return;
  if (e.key === 'z') { e.preventDefault(); app.undo(); }
  if (e.key === 'y' || (e.key === 'Z' && e.shiftKey)) { e.preventDefault(); app.redo(); }
});
window.addEventListener('hashchange', render);
render();
