// Point d'entrée de l'application : état global, routeur, rendu.

import { loadState, saveState, defaultState, seedExamples, exportJSON, importJSON } from './store.js';
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
export const app = {
  state: null,
  schedule: null, // résultat de computeSchedule, recalculé à chaque mutation
  save() {
    saveState(localStorage, this.state);
    this.schedule = computeSchedule(this.state);
  },
  commit() {
    // mutation + sauvegarde + re-rendu
    this.save();
    render();
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
    `<a href="#/${path}" class="${active ? 'active' : ''}">${label}</a>`;

  document.getElementById('nav').innerHTML = `
    ${link('dashboard', '🏠 Tableau de bord', page === 'dashboard')}
    ${link('inscriptions', `📝 Inscriptions ${errorCount ? `<span class="nav-badge">${errorCount}</span>` : ''}`, page === 'inscriptions')}
    ${link('stagiaires', '🧑‍🎓 Stagiaires', page === 'stagiaires')}
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
setupImportExport();
window.addEventListener('hashchange', render);
render();
