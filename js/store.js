// Magasin d'état : état applicatif + persistance localStorage + import/export JSON.
// Aucune dépendance au DOM pour rester testable côté Node.

import {
  DEFAULT_PARAMS, DEFAULT_FORMATIONS, DEFAULT_TEAM, DEFAULT_SITES, DEFAULT_ZONES,
  DEFAULT_RESSOURCES, joursOuvertsParDefaut, joursOuverts,
} from './config.js';
import { dateDuJour } from './dates.js';

export const STORAGE_KEY = 'efi-planning-v1';

export function defaultState() {
  return {
    version: 1,
    params: structuredClone(DEFAULT_PARAMS),
    formations: structuredClone(DEFAULT_FORMATIONS),
    // Sites, zones d'évolution et matériels partagés — le choix du site
    // précède la programmation (docs/SITES-ZONES-PARCOURS.md).
    sites: structuredClone(DEFAULT_SITES),
    zones: structuredClone(DEFAULT_ZONES),
    ressources: structuredClone(DEFAULT_RESSOURCES),
    team: structuredClone(DEFAULT_TEAM),
    openDays: joursOuvertsParDefaut(),
    // Affectations jour par jour : { '2026-09-01': { formateur: 'p1', testeur: 'p2' } }
    dayAssignments: {},
    // Présence des intervenants : { '2026-09-01': ['p1'] } — clé absente = tous présents
    dayPresence: {},
    inscriptions: [],
    nextId: 1,
    // Parcours : ce qu'un stagiaire ACHÈTE, par opposition à ce qui se
    // planifie. Voir addParcours pour ce qu'il porte, et surtout pour ce
    // qu'il ne porte pas.
    parcours: [],
    nextParcoursId: 1,
  };
}

// --- Parcours --------------------------------------------------------------
//
// Un parcours regroupe les lignes d'une même vente : « R489 Cat 1A + 3 + 5 »
// est UN parcours et TROIS séances. Il ne porte que ce qui ne doit exister
// qu'une fois — le montant facturé et le n° de dossier YPAREO.
//
// Ce qu'il ne porte PAS, et c'est délibéré : ni le stagiaire, ni
// l'entreprise, ni la recommandation, ni la liste des catégories. Tout cela
// se déduit de ses lignes. Le stocker en double créerait une seconde source
// de vérité, qui finirait par contredire les séances — un parcours annoncé
// « R489 1A, 3, 5 » alors qu'une des trois lignes a été supprimée depuis.
// Déduire ne coûte rien et ne peut pas diverger.
export function addParcours(state, data = {}) {
  const parcours = {
    id: state.nextParcoursId++,
    dossierYpareo: (data.dossierYpareo || '').trim() || null,
    chiffreAffaires: montantOuNull(data.chiffreAffaires),
  };
  state.parcours.push(parcours);
  return parcours;
}

export function parcoursById(state, id) {
  return (state.parcours || []).find((p) => p.id === id) || null;
}

// Lignes d'un parcours, dans l'ordre où elles ont été posées.
export function lignesDuParcours(state, id) {
  return state.inscriptions.filter((i) => i.parcoursId === id);
}

// Un parcours sans plus aucune ligne n'a plus d'objet : il ne serait visible
// nulle part, mais son montant continuerait de compter dans le chiffre
// d'affaires. On le retire donc en même temps que sa dernière séance.
export function purgerParcoursVides(state) {
  const utilises = new Set(state.inscriptions.map((i) => i.parcoursId).filter((x) => x != null));
  const avant = state.parcours.length;
  state.parcours = state.parcours.filter((p) => utilises.has(p.id));
  return avant - state.parcours.length;
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
  if (jours) {
    state.openDays = Object.fromEntries((state.sites || []).map((s) => [s.id, [...jours]]));
  }
  const ouverts = joursOuverts(state.openDays);
  const [j1, j2 = j1] = ouverts.length ? ouverts : [dateDuJour()];
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
    // Gestion : le n° de dossier YPAREO et le montant facturé ne sont plus
    // portés par la ligne mais par le PARCOURS — une vente, un montant.
    parcoursId: data.parcoursId ?? null,
    formation: data.formation || null,
    type: data.type || 'Initial',
    datePratique: data.datePratique || null,
    debutPratique: data.debutPratique ?? null,
    dateTheorie: data.dateTheorie || null,
    dateTestPratique: data.dateTestPratique || null,
    debutTestPratique: data.debutTestPratique ?? null,
    formateurId: data.formateurId || null, // choix manuel (sinon affectation auto)
    testeurId: data.testeurId || null,
    // Zones d'évolution imposées à la main (sinon affectation automatique,
    // exactement comme les intervenants). Une par séance : deux plateaux
    // Cat 3/5 identiques existent justement pour que le test n'attende pas
    // la formation.
    zoneId: data.zoneId || null,
    zoneTestId: data.zoneTestId || null,
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
  purgerParcoursVides(state);
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
  // Les parcours partent avec : ils ne portent que le montant et le dossier
  // des lignes qu'on vient de retirer. Les garder laisserait un chiffre
  // d'affaires sans une seule séance pour le justifier.
  state.parcours = [];
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
  // Sites, zones et ressources : un état enregistré avant leur existence n'en
  // a aucun. Les injecter vides laisserait une application sans plateau ; on
  // reprend donc le paramétrage livré, que l'écran Paramètres corrige ensuite.
  // Un paramétrage DÉJÀ saisi, lui, n'est pas touché — même réduit à une seule
  // zone, c'est un choix.
  state.sites = state.sites?.length ? state.sites : base.sites;
  state.zones = state.zones?.length ? state.zones : base.zones;
  state.ressources = state.ressources || base.ressources;
  for (const z of [...state.zones, ...state.ressources]) {
    z.dispositifs = z.dispositifs || [];
    z.recos = z.recos || [];
  }
  for (const z of state.zones) if (!Number.isFinite(z.sessions) || z.sessions < 1) z.sessions = 1;
  for (const r of state.ressources) if (!Number.isFinite(r.capacite) || r.capacite < 1) r.capacite = 1;
  // Un pôle absent vaut le site lui-même : isolé, donc jamais enchaînable avec
  // un autre — l'hypothèse prudente, celle qui ne fait pas rouler quelqu'un
  // entre deux villes sans le dire.
  for (const s of state.sites) if (!s.pole) s.pole = s.id;

  state.team = state.team || [];
  // Fenêtre de disponibilité ajoutée après coup : absente = sans limite, ce
  // qui reproduit exactement le comportement d'avant pour les équipes déjà
  // saisies. Normalisée en null pour que la base reçoive un NULL et non ''.
  for (const m of state.team) {
    if (!m.dispoDebut) m.dispoDebut = null;
    if (!m.dispoFin) m.dispoFin = null;
  }
  // Jours d'ouverture : la liste plate devient une carte par site. Ce qui
  // était ouvert « tout court » l'était pour tout le monde — c'est la seule
  // lecture fidèle d'un état enregistré avant les sites.
  if (Array.isArray(state.openDays)) {
    const plats = [...state.openDays].sort();
    state.openDays = Object.fromEntries(state.sites.map((s) => [s.id, [...plats]]));
  }
  state.openDays = state.openDays && typeof state.openDays === 'object' ? state.openDays : {};
  for (const [id, liste] of Object.entries(state.openDays)) {
    state.openDays[id] = [...new Set(Array.isArray(liste) ? liste : [])].sort();
  }
  state.dayAssignments = state.dayAssignments || {};
  state.dayPresence = state.dayPresence || {};
  state.inscriptions = state.inscriptions || [];
  for (const i of state.inscriptions) {
    if (!i.statut) i.statut = 'confirmee';
    if (!i.modeTheorie) i.modeTheorie = 'distance';
  }
  state.nextId = state.nextId || (Math.max(0, ...state.inscriptions.map((i) => i.id)) + 1);

  // Parcours : reprise d'un état où le montant et le dossier étaient portés
  // par la LIGNE. Chaque ligne reçoit son propre parcours — un pour un.
  //
  // Regrouper d'office les lignes d'un même stagiaire serait une
  // interprétation, pas une reprise : rien ne dit que deux lignes du même
  // candidat ont été vendues ensemble. Un pour un ne perd rien, ne devine
  // rien, et laisse le regroupement se faire à la main quand il a un sens.
  // Le total du chiffre d'affaires est inchangé à l'euro près.
  state.parcours = Array.isArray(state.parcours) ? state.parcours : [];
  state.nextParcoursId = state.nextParcoursId
    || (Math.max(0, ...state.parcours.map((p) => p.id)) + 1);
  for (const i of state.inscriptions) {
    if (i.parcoursId != null) {
      // Ligne déjà rattachée mais dont le parcours a disparu : on le recrée
      // plutôt que de la laisser pointer dans le vide.
      if (!state.parcours.some((p) => p.id === i.parcoursId)) {
        state.parcours.push({ id: i.parcoursId, dossierYpareo: null, chiffreAffaires: null });
        state.nextParcoursId = Math.max(state.nextParcoursId, i.parcoursId + 1);
      }
    } else {
      const p = addParcours(state, {
        dossierYpareo: i.dossierYpareo, chiffreAffaires: i.chiffreAffaires,
      });
      i.parcoursId = p.id;
    }
    delete i.dossierYpareo;
    delete i.chiffreAffaires;
  }
  for (const p of state.parcours) {
    if (p.dossierYpareo === undefined) p.dossierYpareo = null;
    if (p.chiffreAffaires === undefined) p.chiffreAffaires = null;
  }
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
