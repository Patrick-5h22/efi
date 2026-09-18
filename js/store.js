// Magasin d'état : état applicatif + persistance localStorage + import/export JSON.
// Aucune dépendance au DOM pour rester testable côté Node.

import { DEFAULT_PARAMS, DEFAULT_FORMATIONS, DEFAULT_TEAM, joursOuvertsParDefaut } from './config.js';
import { dateDuJour } from './dates.js';

export const STORAGE_KEY = 'efi-planning-v1';

export function defaultState() {
  return {
    version: 1,
    params: structuredClone(DEFAULT_PARAMS),
    formations: structuredClone(DEFAULT_FORMATIONS),
    team: structuredClone(DEFAULT_TEAM),
    openDays: joursOuvertsParDefaut(),
    // Affectations jour par jour : { '2026-09-01': { formateur: 'p1', testeur: 'p2' } }
    dayAssignments: {},
    // Présence des intervenants : { '2026-09-01': ['p1'] } — clé absente = tous présents
    dayPresence: {},
    inscriptions: [],
    nextId: 1,
  };
}

// Données de démonstration d'une installation neuve.
//
// Les exemples se posent sur les jours OUVERTS de l'état, quels qu'ils soient.
// Datés en dur (01 et 02/09/2026), ils sortaient de la fenêtre affichée dès
// qu'elle avait glissé : l'application s'ouvrait sur une grille vide et les
// quatre inscriptions restaient invisibles.
//
// « jours » impose des dates : les tests s'en servent pour rester lisibles et
// stables, sans dériver avec le calendrier réel.
export function seedExamples(state, { jours = null } = {}) {
  if (jours) state.openDays = [...jours];
  const [j1, j2 = j1] = state.openDays.length ? state.openDays : [dateDuJour()];
  // Les 4 lignes d'exemple du classeur (dont un cas multi-catégories)
  const rows = [
    {
      stagiaire: 'EXEMPLE - DUPONT Jean', formation: 'R489-1A', type: 'Initial',
      datePratique: j1, debutPratique: 480,
      dateTheorie: j1,
      dateTestPratique: j1, debutTestPratique: 570,
      formateurId: 'p2', testeurId: 'p1',
    },
    {
      stagiaire: 'EXEMPLE - DUPONT Jean', formation: 'R489-3', type: 'Initial',
      datePratique: j1, debutPratique: 780,
      dateTheorie: null,
      dateTestPratique: j1, debutTestPratique: 870,
      formateurId: 'p2', testeurId: 'p1',
    },
    {
      stagiaire: 'EXEMPLE - MARTIN Claire', formation: 'R489-3', type: 'Initial',
      datePratique: j1, debutPratique: 780,
      dateTheorie: j1,
      dateTestPratique: j1, debutTestPratique: 930,
      formateurId: 'p2', testeurId: 'p1',
    },
    {
      stagiaire: 'EXEMPLE - BERNARD Luc', formation: 'HAB-ELEC', type: 'Initial',
      datePratique: j2, debutPratique: 480,
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

// Vide les inscriptions, et RIEN d'autre. Rend le nombre de lignes retirées.
//
// « Réinitialiser toutes les données » emporte l'équipe, les jours EFI, la
// présence des intervenants, le catalogue et les paramètres, puis resème les
// quatre exemples : pour repartir d'un planning vide sans reperdre une
// configuration qu'on a mis du temps à saisir — la présence des intervenants
// se coche jour par jour — il faut une action qui ne retire que les lignes.
//
// nextId n'est PAS remis à 1 : une sauvegarde réimportée plus tard porterait
// alors des identifiants entre-temps réattribués, et deux lignes différentes
// se retrouveraient avec le même numéro.
export function viderInscriptions(state) {
  const n = state.inscriptions.length;
  state.inscriptions = [];
  return n;
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
  // periodStart / periodEnd ont disparu : la fenêtre affichée glisse avec le
  // calendrier. Les laisser traîner dans l'état enregistré ferait croire à un
  // réglage encore actif — c'est justement en avançant periodStart au lundi de
  // la semaine en cours qu'on faisait basculer en anomalie tout le passé.
  delete state.params.periodStart;
  delete state.params.periodEnd;
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
  // Champs de formation ajoutés au fil des versions. dureeTest normalisée en
  // null (et non 0 ni '') : vide signifie « prendre le paramètre global », ce
  // qu'un 0 ne dirait pas — il dirait « test de durée nulle ».
  for (const f of state.formations) {
    if (f.chargeComptee === undefined) f.chargeComptee = true;
    if (f.testOnly === undefined) f.testOnly = false;
    if (!Number.isFinite(f.dureeTest) || f.dureeTest <= 0) f.dureeTest = null;
    if (f.testSurveille === undefined) f.testSurveille = false;
  }
  state.team = state.team || [];
  // Fenêtre de disponibilité ajoutée après coup : absente = sans limite, ce
  // qui reproduit exactement le comportement d'avant pour les équipes déjà
  // saisies. Normalisée en null pour que la base reçoive un NULL et non ''.
  for (const m of state.team) {
    if (!m.dispoDebut) m.dispoDebut = null;
    if (!m.dispoFin) m.dispoFin = null;
  }
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
