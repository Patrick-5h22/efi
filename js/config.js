import { dateDuJour, fenetreAffichage, joursOuvrables } from './dates.js';

// Configuration par défaut — reprise du classeur "Planification EFI v4.2"
// Les durées sont exprimées en minutes, les heures en minutes depuis minuit.

// Plus de periodStart / periodEnd : la fenetre affichee glisse avec le
// calendrier (voir SEMAINES_AFFICHEES dans js/dates.js). Reglees a la main,
// ces deux dates servaient a la fois a decider ce qu'on affiche et a decider
// qu'une date est tenable : avancer le debut faisait basculer en anomalie
// toute seance planifiee avant, alors qu'elle etait seulement passee.
export const DEFAULT_PARAMS = {
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
  // Seconde modalité AIPR : la formation se fait SUR SITE, puis l'épreuve.
  // Deux séances, deux intervenants — un formateur (charge comptée), puis un
  // testeur pour le QCM, qui reste de la surveillance (testSurveille).
  //
  // ⚠ La durée de la partie FORMATION n'est pas encore arrêtée (question en
  // attente). 3h30 est une valeur d'attente, alignée sur l'e-learning en
  // centre, et non une durée validée : elle se corrige dans Paramètres sans
  // toucher au code. La durée de l'ÉPREUVE, elle, est connue : 2h00, comme
  // dans la modalité « épreuve seule ».
  {
    code: 'AIPR-FORM', label: 'AIPR (formation + épreuve)', reco: 'AIPR',
    dureeInitial: 210, dureeRecyclage: 210, tests: true, capacite: 12,
    testOnly: false, chargeComptee: true, dureeTest: 120, testSurveille: true,
  },
];

// Une formation dont la charge n'est pas comptée mobilise un intervenant
// mais n'entre ni dans le plafond quotidien, ni dans le taux d'occupation
// (cas de la surveillance d'épreuve). Défaut : comptée.
export function chargeComptee(formation) {
  return formation?.chargeComptee !== false;
}

// Durée du test pratique, par formation.
//
// « practicalTestDuration » restait un paramètre GLOBAL alors que la durée
// dépend du dispositif : le QCM AIPR tient 2h00 quand un test R489 tient 1h00.
// La valeur du catalogue l'emporte ; vide, on retombe sur le paramètre global,
// qui reste le défaut de toutes les formations qui n'ont rien à déclarer.
export function dureeTestFor(formation, params) {
  const d = formation?.dureeTest;
  return Number.isFinite(d) && d > 0 ? d : params.practicalTestDuration;
}

// Un test « surveillé » est une épreuve que l'on surveille, pas un test que
// l'on fait passer : le QCM AIPR de la modalité « formation + épreuve ».
// Conséquences, identiques à celles de l'épreuve seule : il n'occupe pas le
// testeur (un superviseur habilité et présent suffit) et ne pèse ni dans le
// plafond quotidien ni dans le taux d'occupation. Défaut : non surveillé.
export function testSurveille(formation) {
  return formation?.testSurveille === true;
}

// --- Modalité d'une formation du catalogue --------------------------------
// Trois drapeaux (testOnly, tests, testSurveille) décrivent en réalité trois
// modalités, et seules ces trois combinaisons ont un sens. Les exposer comme
// un choix unique évite les états incohérents — une « épreuve seule » qui
// réclamerait par ailleurs un test séparé, par exemple.
//
// L'AIPR occupe deux de ces trois modalités, et c'est bien le même dispositif
// vendu de deux façons : formation à distance puis QCM sur site, ou formation
// sur site puis QCM.
export const MODALITES_SEANCE = [
  { id: 'formation', label: 'Formation' },
  { id: 'epreuve', label: 'Épreuve surveillée' },
  { id: 'formation-epreuve', label: 'Formation + épreuve surveillée' },
];

export function modaliteDe(formation) {
  if (formation?.testOnly) return 'epreuve';
  return testSurveille(formation) ? 'formation-epreuve' : 'formation';
}

export function appliquerModalite(formation, id) {
  if (id === 'epreuve') {
    // Rien à enchaîner : la seule séance planifiée EST l'épreuve.
    Object.assign(formation, { testOnly: true, tests: false, testSurveille: false });
  } else if (id === 'formation-epreuve') {
    // L'épreuve occupe le créneau « test » : il est donc obligatoire.
    Object.assign(formation, { testOnly: false, tests: true, testSurveille: true });
  } else {
    Object.assign(formation, { testOnly: false, testSurveille: false });
  }
  return formation;
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
  dureeTest: null, testSurveille: false,
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

// --- Disponibilité d'un intervenant ---------------------------------------
// Fenêtre de disponibilité : bornes optionnelles, incluses. Vide = aucune
// borne de ce côté.
//
// Jusqu'ici un intervenant déclaré dans l'outil était réputé disponible sur
// toute la période dès qu'il était habilité : l'absence se saisissait jour par
// jour (page Jours EFI) et la présence était implicite. Une ressource recrutée
// en novembre apparaissait donc libre en septembre, et rien ne le signalait.
// La fenêtre donne le DÉFAUT ; la présence quotidienne garde le dernier mot.
export function dansLaFenetre(membre, date) {
  if (!membre || !date) return false;
  if (membre.dispoDebut && date < membre.dispoDebut) return false;
  if (membre.dispoFin && date > membre.dispoFin) return false;
  return true;
}

// Libellé de la fenêtre, pour les messages d'anomalie et l'écran Équipe.
export function libelleFenetre(membre) {
  const { dispoDebut: d, dispoFin: f } = membre || {};
  if (!d && !f) return 'sans limite';
  if (d && f) return `du ${d} au ${f}`;
  return d ? `à partir du ${d}` : `jusqu’au ${f}`;
}

// --- Sites, zones d'évolution et ressources partagées ---------------------
//
// Trois sites, et le choix du site précède toute programmation : il détermine
// les formations proposables et les zones disponibles
// (docs/SITES-ZONES-PARCOURS.md, § 2 à 4).
//
// Les sites sont regroupés en PÔLES. Périgny et Périgny II sont proches, on
// peut enchaîner les deux dans une journée ; Saintes non. Un pôle se vérifie
// par une comparaison — un temps de trajet demanderait une matrice de
// distances et un paramétrage que personne ne tiendrait à jour.
export const DEFAULT_SITES = [
  { id: 'perigny', label: 'Périgny', pole: 'perigny' },
  { id: 'perigny2', label: 'Périgny II', pole: 'perigny' },
  { id: 'saintes', label: 'Saintes', pole: 'saintes' },
];

// Une zone porte la liste des dispositifs qu'elle admet et son nombre de
// sessions simultanées. Les deux « règles » du premier courriel d'Emmanuel
// n'ont alors pas besoin d'exister : la mutualisation R485 / R489 1A-1B est
// une seule zone qui admet les quatre dispositifs, et le « 2 en parallèle sur
// 3 et/ou 5 » est deux zones à une session. Les deux DÉCOULENT du modèle.
//
// Deux façons d'admettre un dispositif, et la seconde n'est pas un raccourci :
//   « dispositifs » — des codes du catalogue, nommés un par un ;
//   « recos »       — une recommandation entière.
// Les zones de Périgny II admettent la R482 par recommandation : elles
// fonctionneront le jour où les catégories R482 seront créées, sans qu'il
// faille y revenir. Une zone qui nomme un code inconnu est signalée dans
// l'écran Paramètres — sans quoi elle n'admettrait rien, en silence.
export const DEFAULT_ZONES = [
  { id: 'z-mutu', siteId: 'perigny', label: 'R485 / R489 1A-1B (mutualisée)', dispositifs: ['R485-1', 'R485-2', 'R489-1A', 'R489-1B'], recos: [], sessions: 1 },
  { id: 'z-35-1', siteId: 'perigny', label: 'R489 Cat 3/5 #1', dispositifs: ['R489-3', 'R489-5'], recos: [], sessions: 1 },
  { id: 'z-35-2', siteId: 'perigny', label: 'R489 Cat 3/5 #2', dispositifs: ['R489-3', 'R489-5'], recos: [], sessions: 1 },
  { id: 'z-r486', siteId: 'perigny', label: 'R486', dispositifs: ['R486-A', 'R486-B'], recos: [], sessions: 1 },
  { id: 'z-aipr-p', siteId: 'perigny', label: 'AIPR', dispositifs: [], recos: ['AIPR'], sessions: 1 },
  { id: 'z-elec-p', siteId: 'perigny', label: 'Habilitation électrique', dispositifs: ['HAB-ELEC'], recos: [], sessions: 1 },
  // Périgny II : site dédié exclusivement à la R482, aucune autre formation.
  { id: 'z-r482-1', siteId: 'perigny2', label: 'R482 #1', dispositifs: [], recos: ['R482'], sessions: 1 },
  { id: 'z-r482-2', siteId: 'perigny2', label: 'R482 #2', dispositifs: [], recos: ['R482'], sessions: 1 },
  { id: 'z-aipr-s', siteId: 'saintes', label: 'AIPR', dispositifs: [], recos: ['AIPR'], sessions: 1 },
  { id: 'z-elec-s', siteId: 'saintes', label: 'Habilitation électrique', dispositifs: ['HAB-ELEC'], recos: [], sessions: 1 },
];

// Une ressource est un MATÉRIEL partagé entre zones, et non une liste
// d'exclusions. Le premier courriel présentait « Cat A et Cat F jamais en même
// temps » comme une contrainte de site ; c'en est la conséquence, pas la
// cause : « un seul porte-engin accessible des 2 côtés, mais seulement une
// catégorie possible en formation ou en test » (Emmanuel, 18/09/2026).
//
// Une liste d'exclusions aurait marché pour ce cas précis, puis il aurait fallu
// en ajouter une par matériel partagé découvert ensuite. Une ressource se
// déclare, se nomme, et s'étend sans règle nouvelle. Elle dit aussi que la
// contrainte vaut en formation COMME en test : c'est l'occupation du matériel
// qui compte, pas la nature de la séance.
//
// ⚠ Les catégories R482 n'existent pas encore au catalogue : cette ressource
// n'a donc encore aucun effet. L'écran Paramètres le signale plutôt que de
// laisser croire à une contrainte active. Reste à confirmer si B1, C1 et G
// utilisent aussi le porte-engin — le courriel ne nommait que A et F.
export const DEFAULT_RESSOURCES = [
  {
    id: 'porte-engin', siteId: 'perigny2', label: 'Porte-engin', capacite: 1,
    dispositifs: ['R482-A', 'R482-F'], recos: [],
  },
];

// Le dispositif d'une formation est-il admis ici ? Vaut pour une zone comme
// pour une ressource : les deux portent les mêmes deux listes.
export function admetDispositif(porteur, formation) {
  if (!porteur || !formation) return false;
  return (porteur.dispositifs || []).includes(formation.code)
    || (porteur.recos || []).includes(formation.reco);
}

export function zonesPour(zones, formation, siteId = null) {
  return (zones || []).filter((z) => admetDispositif(z, formation)
    && (!siteId || z.siteId === siteId));
}

export function sitesPour(sites, zones, formation) {
  const ids = new Set(zonesPour(zones, formation).map((z) => z.siteId));
  return (sites || []).filter((s) => ids.has(s.id));
}

export function siteById(sites, id) {
  return (sites || []).find((s) => s.id === id) || null;
}

export function poleDuSite(sites, id) {
  return siteById(sites, id)?.pole ?? null;
}

// Codes et recommandations nommés par une zone ou une ressource sans exister
// au catalogue. Une zone qui nomme un code inconnu n'admet rien — et le dirait
// nulle part. L'écran Paramètres s'en sert pour le montrer.
export function referencesInconnues(porteur, formations) {
  const codes = new Set((formations || []).map((f) => f.code));
  const recos = new Set((formations || []).map((f) => f.reco));
  return [
    ...(porteur?.dispositifs || []).filter((c) => !codes.has(c)),
    ...(porteur?.recos || []).filter((r) => !recos.has(r)),
  ];
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
// Jours ouverts d'une installation neuve : les deux premiers jours ouvrables
// de la fenêtre affichée, et non deux dates fixes.
//
// Datés en dur (01 et 02/09/2026), ils tombaient hors de la fenêtre dès que
// celle-ci avait glissé : une installation neuve s'ouvrait sur une grille
// vide, et les quatre inscriptions d'exemple restaient invisibles.
export function joursOuvertsParDefaut(aujourdHui = dateDuJour()) {
  return joursOuvrables(DEFAULT_PARAMS, ...Object.values(fenetreAffichage(aujourdHui))).slice(0, 2);
}

export function formationByCode(formations, code) {
  return formations.find((f) => f.code === code) || null;
}

export function dureeFor(formation, type) {
  if (!formation) return 0;
  return type === 'Recyclage' ? formation.dureeRecyclage : formation.dureeInitial;
}
