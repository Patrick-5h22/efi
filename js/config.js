// Configuration par défaut — reprise du classeur "Planification EFI v4.2"
// Les durées sont exprimées en minutes, les heures en minutes depuis minuit.

export const DEFAULT_PARAMS = {
  periodStart: '2026-09-01',
  periodEnd: '2026-12-31',
  dayStart: 480,             // 08:00
  dayEnd: 1020,              // 17:00
  slotMinutes: 30,
  theoryTime: 660,           // 11:00 — créneau unique du test théorique
  theoryDuration: 60,        // 1h00
  practicalTestDuration: 60, // 1h00
  maxDailyLoad: 360,         // 6h00 de formation pratique max / jour / formateur
  salleCapacite: 12,         // places en salle de théorie (présentiel + e-learning en centre)
  // Pause déjeuner — désactivée par défaut, car l'activer fait basculer en
  // anomalie toute inscription existante qui la chevauche. À ouvrir depuis
  // Paramètres une fois le planning en place.
  pauseActive: false,
  pauseDebut: 720,           // 12:00
  pauseFin: 780,             // 13:00
  holidays: [
    { date: '2026-11-11', label: 'Armistice 1918' },
    { date: '2026-12-25', label: 'Noël' },
  ],
};

export const DEFAULT_FORMATIONS = [
  { code: 'R489-1A', label: 'Pratique R489 Cat 1A', reco: 'R489', dureeInitial: 90, dureeRecyclage: 60, tests: true, capacite: 1 },
  { code: 'R489-1B', label: 'Pratique R489 Cat 1B', reco: 'R489', dureeInitial: 90, dureeRecyclage: 60, tests: true, capacite: 1 },
  { code: 'R489-3', label: 'Pratique R489 Cat 3', reco: 'R489', dureeInitial: 90, dureeRecyclage: 60, tests: true, capacite: 2 },
  { code: 'R489-5', label: 'Pratique R489 Cat 5', reco: 'R489', dureeInitial: 90, dureeRecyclage: 60, tests: true, capacite: 1 },
  { code: 'R486-A', label: 'Pratique R486 Cat A', reco: 'R486', dureeInitial: 120, dureeRecyclage: 120, tests: true, capacite: 1 },
  { code: 'R486-B', label: 'Pratique R486 Cat B', reco: 'R486', dureeInitial: 120, dureeRecyclage: 120, tests: true, capacite: 1 },
  { code: 'R485-1', label: 'Pratique R485 Cat 1', reco: 'R485', dureeInitial: 90, dureeRecyclage: 60, tests: true, capacite: 1 },
  { code: 'R485-2', label: 'Pratique R485 Cat 2', reco: 'R485', dureeInitial: 90, dureeRecyclage: 60, tests: true, capacite: 1 },
  { code: 'HAB-ELEC', label: 'Habilitation électrique', reco: 'HAB ELEC', dureeInitial: 120, dureeRecyclage: 120, tests: false, capacite: 1 },
  // AIPR : la formation se fait à distance (e-learning) — seule l'épreuve
  // (QCM surveillé, 2h00) est planifiée sur site, tenue par un testeur.
  // Surveillance : ne consomme pas de temps d'intervenant (chargeComptee).
  { code: 'AIPR', label: 'AIPR (épreuve sur site)', reco: 'AIPR', dureeInitial: 120, dureeRecyclage: 120, tests: false, capacite: 1, testOnly: true, chargeComptee: false },
];

// Une formation dont la charge n'est pas comptée mobilise un intervenant
// mais n'entre ni dans le plafond quotidien, ni dans le taux d'occupation
// (cas de la surveillance d'épreuve). Défaut : comptée.
export function chargeComptee(formation) {
  return formation?.chargeComptee !== false;
}

// --- Pause déjeuner --------------------------------------------------------
// Quand elle est active, aucune pratique, aucun test et aucune théorie en
// centre ne peut la chevaucher. Une seule exception, assumée : la théorie
// PRÉSENTIELLE. Une session initiale dure 7h00 dans une journée de 9h00 ;
// pause déduite il ne reste que 8h00, et aucune demi-journée ne peut
// l'accueillir. Elle enjambe donc la pause, comme une journée de formation
// ordinaire. (Le classeur d'Emmanuel peint la pause par-dessus le bloc de
// théorie, ce qui ne délivre que 6h00 — divergence à trancher avec lui.)
export function pauseCreneau(params) {
  if (!params?.pauseActive) return null;
  const debut = params.pauseDebut ?? 720;
  const fin = params.pauseFin ?? 780;
  return fin > debut ? { debut, fin } : null;
}

export function chevauchePause(params, start, end) {
  const p = pauseCreneau(params);
  if (!p || start == null || end == null) return false;
  return start < p.fin && end > p.debut;
}

// Modèle d'une formation du catalogue : valeurs par défaut d'une création.
export const FORMATION_DEFAUT = {
  code: '', label: '', reco: '',
  dureeInitial: 90, dureeRecyclage: 60,
  tests: true, capacite: 1, testOnly: false, chargeComptee: true,
};

export const TYPES = ['Initial', 'Recyclage'];

// Théorie de la formation (phase présentielle ou e-learning en centre)
export const THEORIE_PRESENTIEL_DUREES = { Initial: 420, Recyclage: 210 }; // 7h00 / 3h30
export const THEORIE_CENTRE_DUREE_DEFAUT = 210; // 3h30, modifiable à la saisie
export const MODES_THEORIE = [
  { id: 'distance', label: 'E-learning hors centre (rien à planifier)' },
  { id: 'centre', label: 'E-learning en centre (créneau en salle)' },
  { id: 'presentiel', label: 'Présentiel (session inter)' },
];

export function dureeTheorieFor(insc) {
  if (insc.modeTheorie === 'presentiel') return THEORIE_PRESENTIEL_DUREES[insc.type] ?? THEORIE_PRESENTIEL_DUREES.Initial;
  if (insc.modeTheorie === 'centre') return insc.dureeTheorieCentre ?? THEORIE_CENTRE_DUREE_DEFAUT;
  return 0;
}

export const MAX_TEAM = 12;

// Équipe d'exemple (identique au classeur)
export const DEFAULT_TEAM = [
  {
    id: 'p1',
    name: 'MEDAN Dominique',
    quals: Object.fromEntries(DEFAULT_FORMATIONS.map((f) => [f.code, { F: true, T: true }])),
  },
  {
    id: 'p2',
    name: 'GARCIA Thierry',
    quals: Object.fromEntries(DEFAULT_FORMATIONS.map((f) => [f.code, { F: true, T: true }])),
  },
];

// Jours d'ouverture du plateau technique livrés en exemple
export const DEFAULT_OPEN_DAYS = ['2026-09-01', '2026-09-02'];

export function formationByCode(formations, code) {
  return formations.find((f) => f.code === code) || null;
}

export function dureeFor(formation, type) {
  if (!formation) return 0;
  return type === 'Recyclage' ? formation.dureeRecyclage : formation.dureeInitial;
}
