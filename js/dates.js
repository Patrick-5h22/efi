// Utilitaires de dates. Les dates sont des chaînes ISO 'YYYY-MM-DD',
// les heures des minutes depuis minuit (ex : 480 = 08:00).

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISO(date) {
  return date.toISOString().slice(0, 10);
}

// Date du jour, aux heures locales du centre.
//
// Le serveur tourne en UTC : passé minuit à Paris, « toISOString » rend encore
// la veille, et une recherche de disponibilités proposerait alors la journée
// écoulée. On ne déduit donc jamais « aujourd'hui » d'un horodatage UTC.
export function dateDuJour(maintenant = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(maintenant);
}

export function addDays(iso, n) {
  const d = parseISO(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return toISO(d);
}

export function dayOfWeek(iso) {
  // 1 = lundi … 7 = dimanche
  const d = parseISO(iso).getUTCDay();
  return d === 0 ? 7 : d;
}

export function isWeekend(iso) {
  return dayOfWeek(iso) >= 6;
}

// Numéro de semaine ISO 8601
export function isoWeek(iso) {
  const d = parseISO(iso);
  const day = (d.getUTCDay() + 6) % 7; // 0 = lundi
  d.setUTCDate(d.getUTCDate() - day + 3); // jeudi de la semaine
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const ftDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDay + 3);
  return 1 + Math.round((d - firstThursday) / (7 * 24 * 3600 * 1000));
}

// Lundi de la semaine contenant la date
export function mondayOf(iso) {
  return addDays(iso, 1 - dayOfWeek(iso));
}

export function fmtTime(minutes) {
  if (minutes == null || Number.isNaN(minutes)) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function parseTime(str) {
  if (!str) return null;
  const m = /^(\d{1,2})[:h]?(\d{2})?(?::\d{2})?$/.exec(str.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2] || 0);
}

const DAY_NAMES = ['', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function fmtDateLong(iso) {
  if (!iso) return '';
  const d = parseISO(iso);
  return `${DAY_NAMES[dayOfWeek(iso)]} ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function fmtDateShort(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function fmtDateDay(iso) {
  if (!iso) return '';
  const d = parseISO(iso);
  return `${DAY_NAMES[dayOfWeek(iso)].slice(0, 3)} ${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Jours ouvrables et fenêtre d'affichage — deux notions distinctes
//
// Elles n'en faisaient qu'une, et c'était un défaut : une période bornée par
// deux dates réglées à la main servait à la fois à décider CE QU'ON AFFICHE et
// à décider QU'UNE DATE EST TENABLE. Avancer le début de période au lundi de
// la semaine en cours faisait donc basculer en anomalie — « hors période ou
// jour non ouvré » — toutes les séances déjà planifiées avant ce lundi. Elles
// n'avaient pourtant rien d'anormal : elles étaient seulement passées.
//
// Désormais : un jour est ouvrable s'il n'est ni week-end ni férié, point ;
// et la fenêtre d'affichage glisse d'elle-même avec le calendrier.
// ---------------------------------------------------------------------------

// Nombre de semaines montrées, à partir de la semaine en cours.
export const SEMAINES_AFFICHEES = 16;

// Ni week-end, ni férié. C'est la seule question que se pose un contrôle de
// cohérence sur une date : rien à voir avec ce qu'on affiche aujourd'hui.
export function estJourOuvrable(params, iso) {
  const feries = new Set((params.holidays || []).map((h) => h.date || h));
  return !isWeekend(iso) && !feries.has(iso);
}

// Seize semaines à partir du lundi de la semaine en cours. Bornes incluses.
export function fenetreAffichage(aujourdHui = dateDuJour()) {
  const debut = mondayOf(aujourdHui);
  return { debut, fin: addDays(debut, SEMAINES_AFFICHEES * 7 - 1) };
}

// Jours ouvrables d'un intervalle, bornes incluses.
export function joursOuvrables(params, debut, fin) {
  const feries = new Set((params.holidays || []).map((h) => h.date || h));
  const out = [];
  for (let d = debut; d <= fin; d = addDays(d, 1)) {
    if (!isWeekend(d) && !feries.has(d)) out.push(d);
  }
  return out;
}

// Jours ouvrables de la fenêtre d'affichage.
export function workingDays(params, aujourdHui = dateDuJour()) {
  const { debut, fin } = fenetreAffichage(aujourdHui);
  return joursOuvrables(params, debut, fin);
}

// Premier et dernier jour du mois d'une date.
export function bornesDuMois(iso) {
  const d = parseISO(iso);
  const debut = `${iso.slice(0, 7)}-01`;
  const fin = toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
  return { debut, fin };
}

// Créneaux de 30 min de la journée : [480, 510, …, 990]
export function daySlots(params) {
  const out = [];
  for (let t = params.dayStart; t < params.dayEnd; t += params.slotMinutes) out.push(t);
  return out;
}

// Les seize semaines de la fenêtre, de la semaine en cours à la seizième.
//
// Comptées sur les lundis et non sur les jours ouvrables : une semaine
// entièrement fériée compte quand même, et la liste fait toujours exactement
// SEMAINES_AFFICHEES entrées.
export function semainesAffichees(aujourdHui = dateDuJour()) {
  const { debut } = fenetreAffichage(aujourdHui);
  return Array.from({ length: SEMAINES_AFFICHEES }, (_, i) => {
    const monday = addDays(debut, i * 7);
    return { week: isoWeek(monday), monday };
  });
}

// Semaine à afficher quand aucune n'est demandée : celle d'aujourd'hui.
//
// Le défaut était « la première semaine qui porte une inscription », donc la
// plus ancienne : les vues s'ouvraient figées sur un passé révolu, et il
// fallait cliquer autant de fois que de semaines écoulées pour revenir au
// présent. Un tableau de bord parle d'abord d'aujourd'hui.
//
// Si la semaine du jour ne figure pas dans la liste reçue, on prend la
// suivante qui y figure — jamais une précédente.
export function semaineParDefaut(weeks, aujourdHui = dateDuJour()) {
  if (!weeks?.length) return null;
  const lundi = mondayOf(aujourdHui);
  const exacte = weeks.find((w) => w.monday === lundi);
  const suivante = weeks.find((w) => w.monday >= lundi);
  return (exacte || suivante || weeks[weeks.length - 1]).week;
}

// Jours lun-ven d'une semaine donnée par son lundi
export function weekDays(monday) {
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
}

export function overlaps(start1, end1, start2, end2) {
  return start1 < end2 && start2 < end1;
}
