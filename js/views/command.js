// Palette de commandes (Ctrl+K / ⌘K) — inspirée du composant « command »
// de la référence shadcn utilisée par efi-placement.
// Navigation, semaines, dossiers, actions et thèmes, filtrés en direct.

import { app, esc, navigate } from '../app.js';
import { periodWeeks, fmtDateShort } from '../dates.js';
import { openInscriptionForm } from './form.js';
import { THEME_PRESETS, setTheme, getTheme } from '../theme.js';

let dialog = null;

function buildItems() {
  const state = app.state;
  const items = [];

  items.push(
    { group: 'Navigation', label: '🏠 Tableau de bord', run: () => navigate('dashboard') },
    { group: 'Navigation', label: '📝 Inscriptions', run: () => navigate('inscriptions') },
    { group: 'Navigation', label: '🗂 Dossiers', run: () => navigate('stagiaires') },
    { group: 'Navigation', label: '📋 Synthèse semaine', run: () => navigate('synthese') },
    { group: 'Navigation', label: '👷 Planning formateur', run: () => navigate('planning-formateur') },
    { group: 'Navigation', label: '🔎 Planning testeur', run: () => navigate('planning-testeur') },
    { group: 'Navigation', label: '👥 Équipe', run: () => navigate('equipe') },
    { group: 'Navigation', label: '📆 Jours EFI', run: () => navigate('jours') },
    { group: 'Navigation', label: '⚙️ Paramètres', run: () => navigate('parametres') },
    { group: 'Navigation', label: '❓ Mode d’emploi', run: () => navigate('aide') },
    { group: 'Actions', label: '➕ Inscrire un stagiaire', run: () => openInscriptionForm() },
    { group: 'Actions', label: '↩ Annuler la dernière action', run: () => app.undo() },
  );

  for (const { week, monday } of periodWeeks(state.params)) {
    items.push({
      group: 'Semaines',
      label: `🗓 Semaine ${week} — ${fmtDateShort(monday)}`,
      keywords: `s${week}`,
      run: () => navigate(`semaine/${week}`),
    });
  }

  const seen = new Set();
  for (const i of state.inscriptions) {
    const key = i.stagiaire.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      group: 'Dossiers',
      label: `🧑‍🎓 ${i.stagiaire}${i.entreprise ? ` — ${i.entreprise}` : ''}`,
      run: () => { navigate('stagiaires'); },
    });
  }

  const current = getTheme();
  for (const p of THEME_PRESETS) {
    items.push({
      group: 'Thème',
      label: `🎨 Thème ${p.label}${p.id === current.preset ? ' ✓' : ''}`,
      run: () => setTheme({ preset: p.id }),
    });
  }
  items.push(
    { group: 'Thème', label: '☀️ Mode clair', run: () => setTheme({ mode: 'light' }) },
    { group: 'Thème', label: '🌙 Mode sombre', run: () => setTheme({ mode: 'dark' }) },
    { group: 'Thème', label: '💻 Mode système', run: () => setTheme({ mode: 'auto' }) },
  );

  return items;
}

function close() {
  dialog?.close();
  dialog?.remove();
  dialog = null;
}

export function openCommandPalette() {
  if (dialog) { close(); return; }
  const items = buildItems();
  let filtered = items;
  let selected = 0;

  dialog = document.createElement('dialog');
  dialog.className = 'cmdk';
  dialog.innerHTML = `
    <input class="cmdk-input" placeholder="Rechercher une page, une semaine, un dossier, un thème…" aria-label="Commande">
    <div class="cmdk-list" role="listbox"></div>
    <div class="cmdk-hint">↑↓ naviguer · Entrée exécuter · Échap fermer</div>
  `;
  document.body.appendChild(dialog);
  const input = dialog.querySelector('.cmdk-input');
  const list = dialog.querySelector('.cmdk-list');

  const renderList = () => {
    let lastGroup = null;
    list.innerHTML = filtered.slice(0, 40).map((item, idx) => {
      const header = item.group !== lastGroup ? `<div class="cmdk-group">${esc(item.group)}</div>` : '';
      lastGroup = item.group;
      return `${header}<button class="cmdk-item ${idx === selected ? 'selected' : ''}" data-idx="${idx}" role="option">${esc(item.label)}</button>`;
    }).join('') || '<div class="cmdk-empty">Aucun résultat</div>';
    list.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
    list.querySelectorAll('.cmdk-item').forEach((b) => {
      b.addEventListener('click', () => { const it = filtered[Number(b.dataset.idx)]; close(); it.run(); });
    });
  };

  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  input.addEventListener('input', () => {
    const q = norm(input.value.trim());
    filtered = !q ? items : items.filter((i) => norm(i.label + ' ' + (i.keywords || '')).includes(q));
    selected = 0;
    renderList();
  });

  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); selected = Math.min(selected + 1, Math.min(filtered.length, 40) - 1); renderList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); selected = Math.max(selected - 1, 0); renderList(); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = filtered[selected]; if (it) { close(); it.run(); } }
  });
  dialog.addEventListener('cancel', () => { dialog.remove(); dialog = null; });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });

  renderList();
  dialog.showModal();
  input.focus();
}

export function setupCommandPalette() {
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openCommandPalette();
    }
  });
}
