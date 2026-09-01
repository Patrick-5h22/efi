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
    // Présence des intervenants : { '2026-09-01': ['p1'] } — clé absente = tous présents
    dayPresence: {},
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

// Montant en euros : null si non saisi, sinon un nombre positif. Une saisie
// invalide vaut « non renseigné » plutôt que zéro, pour ne pas fausser le CA.
export function montantOuNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'string' ? Number(v.replace(',', '.').replace(/\s/g, '')) : Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function addInscription(state, data) {
  const insc = {
    id: state.nextId++,
    stagiaire: (data.stagiaire || '').trim(),
    // Gestion — saisi par l'assistante : n° de dossier YPAREO (10 chiffres)
    // et montant facturé de la ligne.
    dossierYpareo: (data.dossierYpareo || '').trim() || null,
    chiffreAffaires: montantOuNull(data.chiffreAffaires),
    formation: data.formation || null,
    type: data.type || 'Initial',
    datePratique: data.datePratique || null,
    debutPratique: data.debutPratique ?? null,
    dateTheorie: data.dateTheorie || null,
    dateTestPratique: data.dateTestPratique || null,
    debutTestPratique: data.debutTestPratique ?? null,
    formateurId: data.formateurId || null, // choix manuel (sinon affectation auto)
    testeurId: data.testeurId || null,
    // Théorie de la formation : distance (e-learning hors centre, défaut —
    // rien à planifier) | centre (e-learning en centre : créneau en salle)
    // | presentiel (session inter mutualisée par recommandation)
    modeTheorie: data.modeTheorie || 'distance',
    dateTheorieFormation: data.dateTheorieFormation || null,
    debutTheorieFormation: data.debutTheorieFormation ?? null,
    dureeTheorieCentre: data.dureeTheorieCentre ?? null, // minutes (mode centre, défaut 3h30)
    formateurTheorieId: data.formateurTheorieId || null, // présentiel (sinon auto)
    // Dossier de réservation
    entreprise: (data.entreprise || '').trim() || null,
    siret: (data.siret || '').trim() || null,
    statut: data.statut || 'confirmee', // pre | confirmee | annulee
    motifAnnulation: (data.motifAnnulation || '').trim() || null,
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
  // Formations ajoutées au catalogue par défaut (ex. AIPR) : injectées dans
  // les états existants sans toucher aux formations personnalisées
  for (const f of base.formations) {
    if (!state.formations.some((x) => x.code === f.code)) state.formations.push(structuredClone(f));
  }
  // Formations « épreuve seule » du catalogue (AIPR) : le drapeau testOnly
  // doit suivre même si la formation existait déjà dans l'état (créée avant
  // son ajout au catalogue, ou coche « tests » posée par erreur) — une
  // épreuve surveillée n'a ni formateur ni tests séparés, et sa surveillance
  // ne consomme pas de temps d'intervenant.
  for (const f of base.formations) {
    if (!f.testOnly) continue;
    const x = state.formations.find((x) => x.code === f.code);
    if (x && (!x.testOnly || x.tests)) { x.testOnly = true; x.tests = false; }
    if (x && f.chargeComptee === false && x.chargeComptee !== false) x.chargeComptee = false;
  }
  // Champs de formation ajoutés au fil des versions
  for (const f of state.formations) {
    if (f.chargeComptee === undefined) f.chargeComptee = true;
    if (f.testOnly === undefined) f.testOnly = false;
  }
  state.team = state.team || [];
  state.openDays = state.openDays || [];
  state.dayAssignments = state.dayAssignments || {};
  state.dayPresence = state.dayPresence || {};
  state.inscriptions = state.inscriptions || [];
  for (const i of state.inscriptions) {
    if (!i.statut) i.statut = 'confirmee';
    if (!i.modeTheorie) i.modeTheorie = 'distance';
    // Champs de gestion ajoutés au fil des versions
    if (i.dossierYpareo === undefined) i.dossierYpareo = null;
    if (i.chiffreAffaires === undefined) i.chiffreAffaires = null;
  }
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
