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
  { code: 'HAB-ELEC', label: 'Habilitation électrique', reco: 'HAB ELEC', dureeInitial: 120, dureeRecyclage: 120, tests: false, capacite: 1 },
  // AIPR : la formation se fait à distance (e-learning) — seule l'épreuve
  // (QCM surveillé, 2h00) est planifiée sur site, tenue par un testeur.
  { code: 'AIPR', label: 'AIPR (épreuve sur site)', reco: 'AIPR', dureeInitial: 120, dureeRecyclage: 120, tests: false, capacite: 1, testOnly: true },
];

export const TYPES = ['Initial', 'Recyclage'];

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
