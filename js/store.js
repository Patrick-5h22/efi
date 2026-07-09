// Magasin d'état : état applicatif + persistance localStorage + import/export JSON.
// Aucune dépendance au DOM pour rester testable côté Node.

import { DEFAULT_PARAMS, DEFAULT_FORMATIONS, DEFAULT_TEAM, DEFAULT_OPEN_DAYS } from './config.js';

export const STORAGE_KEY = 'efi-planning-v1';

export function defaultState() {
  return {
    version: 1,
    params: structuredClone(DEFAULT_PARAMS),
    formations: structuredClone(DEFAULT_FORMATIONS),
    team: structuredClone(DEFAULT_TEAM),
    openDays: [...DEFAULT_OPEN_DAYS],
    // Affectations jour par jour : { '2026-09-01': { formateur: 'p1', testeur: 'p2' } }
    dayAssignments: {},
    inscriptions: [],
    nextId: 1,
  };
}

export function seedExamples(state) {
  // Les 4 lignes d'exemple du classeur (dont un cas multi-catégories)
  const rows = [
    {
      stagiaire: 'EXEMPLE - DUPONT Jean', formation: 'R489-1A', type: 'Initial',
      datePratique: '2026-09-01', debutPratique: 480,
      dateTheorie: '2026-09-01',
      dateTestPratique: '2026-09-01', debutTestPratique: 570,
      formateurId: 'p2', testeurId: 'p1',
    },
    {
      stagiaire: 'EXEMPLE - DUPONT Jean', formation: 'R489-3', type: 'Initial',
      datePratique: '2026-09-01', debutPratique: 780,
      dateTheorie: null,
      dateTestPratique: '2026-09-01', debutTestPratique: 870,
      formateurId: 'p2', testeurId: 'p1',
    },
    {
      stagiaire: 'EXEMPLE - MARTIN Claire', formation: 'R489-3', type: 'Initial',
      datePratique: '2026-09-01', debutPratique: 780,
      dateTheorie: '2026-09-01',
      dateTestPratique: '2026-09-01', debutTestPratique: 930,
      formateurId: 'p2', testeurId: 'p1',
    },
    {
      stagiaire: 'EXEMPLE - BERNARD Luc', formation: 'HAB-ELEC', type: 'Initial',
      datePratique: '2026-09-02', debutPratique: 480,
      dateTheorie: null,
      dateTestPratique: null, debutTestPratique: null,
      formateurId: 'p1', testeurId: null,
    },
  ];
  for (const row of rows) addInscription(state, row);
  return state;
}

export function addInscription(state, data) {
  const insc = {
    id: state.nextId++,
    stagiaire: (data.stagiaire || '').trim(),
    formation: data.formation || null,
    type: data.type || 'Initial',
    datePratique: data.datePratique || null,
    debutPratique: data.debutPratique ?? null,
    dateTheorie: data.dateTheorie || null,
    dateTestPratique: data.dateTestPratique || null,
    debutTestPratique: data.debutTestPratique ?? null,
    formateurId: data.formateurId || null, // choix manuel (sinon affectation auto)
    testeurId: data.testeurId || null,
  };
  state.inscriptions.push(insc);
  return insc;
}

export function updateInscription(state, id, data) {
  const insc = state.inscriptions.find((i) => i.id === id);
  if (!insc) return null;
  Object.assign(insc, data);
  return insc;
}

export function removeInscription(state, id) {
  const idx = state.inscriptions.findIndex((i) => i.id === id);
  if (idx >= 0) state.inscriptions.splice(idx, 1);
}

export function memberById(state, id) {
  return state.team.find((m) => m.id === id) || null;
}

export function memberName(state, id) {
  const m = memberById(state, id);
  return m ? m.name : '';
}

// --- Persistance (navigateur uniquement) ---

export function loadState(storage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw);
    return migrate(state);
  } catch {
    return null;
  }
}

export function saveState(storage, state) {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function migrate(state) {
  const base = defaultState();
  // Complète les champs manquants sans écraser les données existantes
  state.params = { ...base.params, ...(state.params || {}) };
  state.formations = state.formations?.length ? state.formations : base.formations;
  state.team = state.team || [];
  state.openDays = state.openDays || [];
  state.dayAssignments = state.dayAssignments || {};
  state.inscriptions = state.inscriptions || [];
  state.nextId = state.nextId || (Math.max(0, ...state.inscriptions.map((i) => i.id)) + 1);
  return state;
}

export function exportJSON(state) {
  return JSON.stringify(state, null, 2);
}

export function importJSON(text) {
  const state = JSON.parse(text);
  if (!state || typeof state !== 'object' || !Array.isArray(state.inscriptions)) {
    throw new Error('Fichier invalide : ce n’est pas une sauvegarde EFI.');
  }
  return migrate(state);
}
