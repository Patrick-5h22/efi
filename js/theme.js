// Thèmes — reprise du système d'efi-placement (phase 4.1) :
// 9 presets shadcn + le preset « néon » (phase 4.3), mode clair/sombre/auto.
// Appliqué sur <html> via data-theme + classe .dark, persisté en localStorage.

export const THEME_PRESETS = [
  { id: 'teal', label: 'Teal', dot: 'oklch(0.52 0.105 223.128)' },
  { id: 'neutral', label: 'Neutre', dot: 'oklch(0.205 0 0)' },
  { id: 'rose', label: 'Rose', dot: 'oklch(0.645 0.246 16.439)' },
  { id: 'orange', label: 'Orange', dot: 'oklch(0.705 0.213 47.604)' },
  { id: 'green', label: 'Vert', dot: 'oklch(0.723 0.219 149.579)' },
  { id: 'blue', label: 'Bleu', dot: 'oklch(0.623 0.214 259.815)' },
  { id: 'violet', label: 'Violet', dot: 'oklch(0.606 0.25 292.717)' },
  { id: 'red', label: 'Rouge', dot: 'oklch(0.577 0.245 27.325)' },
  { id: 'yellow', label: 'Jaune', dot: 'oklch(0.795 0.184 86.047)' },
  { id: 'neon', label: 'Néon (sombre)', dot: 'oklch(0.82 0.15 195)' },
];

export const MODES = [
  { id: 'light', label: 'Clair', icon: '☀️' },
  { id: 'dark', label: 'Sombre', icon: '🌙' },
  { id: 'auto', label: 'Système', icon: '💻' },
];

const KEY = 'efi-theme';

export function getTheme(storage = localStorage) {
  try {
    const saved = JSON.parse(storage.getItem(KEY) || '{}');
    return {
      preset: THEME_PRESETS.some((p) => p.id === saved.preset) ? saved.preset : 'teal',
      mode: ['light', 'dark', 'auto'].includes(saved.mode) ? saved.mode : 'auto',
    };
  } catch {
    return { preset: 'teal', mode: 'auto' };
  }
}

export function setTheme(next, storage = localStorage) {
  const current = getTheme(storage);
  const theme = { ...current, ...next };
  // Le preset néon n'a de sens qu'en sombre
  if (theme.preset === 'neon' && theme.mode !== 'dark') theme.mode = 'dark';
  storage.setItem(KEY, JSON.stringify(theme));
  applyTheme(theme);
  return theme;
}

export function applyTheme(theme = getTheme()) {
  const html = document.documentElement;
  html.dataset.theme = theme.preset;
  const wantsDark = theme.mode === 'dark'
    || (theme.mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  html.classList.toggle('dark', wantsDark);
  html.style.colorScheme = wantsDark ? 'dark' : 'light';
}

// Suit le système quand le mode est « auto »
export function watchSystemTheme() {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTheme().mode === 'auto') applyTheme();
  });
}

// ---------------------------------------------------------------------------
// Menu de sélection (pastille + label + check, comme ThemeSelect de la référence)
// ---------------------------------------------------------------------------
export function setupThemeMenu(button, esc) {
  let pop = null;

  const close = () => { pop?.remove(); pop = null; };

  const open = () => {
    const theme = getTheme();
    pop = document.createElement('div');
    pop.className = 'theme-pop';
    pop.innerHTML = `
      <div class="theme-label">Thème</div>
      ${THEME_PRESETS.map((p) => `
        <button data-preset="${p.id}">
          <span class="theme-dot" style="background:${p.dot}"></span>
          ${esc(p.label)}
          ${p.id === theme.preset ? '<span class="theme-check">✓</span>' : ''}
        </button>`).join('')}
      <div class="theme-sep"></div>
      <div class="theme-label">Mode</div>
      ${MODES.map((m) => `
        <button data-mode="${m.id}">
          <span style="width:14px;text-align:center">${m.icon}</span>
          ${esc(m.label)}
          ${m.id === theme.mode ? '<span class="theme-check">✓</span>' : ''}
        </button>`).join('')}
    `;
    pop.querySelectorAll('[data-preset]').forEach((b) =>
      b.addEventListener('click', () => { setTheme({ preset: b.dataset.preset }); close(); }));
    pop.querySelectorAll('[data-mode]').forEach((b) =>
      b.addEventListener('click', () => { setTheme({ mode: b.dataset.mode }); close(); }));
    button.parentElement.appendChild(pop);
  };

  button.addEventListener('click', (e) => {
    e.stopPropagation();
    pop ? close() : open();
  });
  document.addEventListener('click', (e) => {
    if (pop && !pop.contains(e.target)) close();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}
