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

// Liste des jours ouvrés de la période (hors week-ends et fériés)
export function workingDays(params) {
  const holidays = new Set((params.holidays || []).map((h) => h.date || h));
  const out = [];
  for (let d = params.periodStart; d <= params.periodEnd; d = addDays(d, 1)) {
    if (!isWeekend(d) && !holidays.has(d)) out.push(d);
  }
  return out;
}

// Créneaux de 30 min de la journée : [480, 510, …, 990]
export function daySlots(params) {
  const out = [];
  for (let t = params.dayStart; t < params.dayEnd; t += params.slotMinutes) out.push(t);
  return out;
}

// Numéros de semaines couvertes par la période
export function periodWeeks(params) {
  const seen = new Map(); // week -> monday
  for (const d of workingDays(params)) {
    const w = isoWeek(d);
    if (!seen.has(w)) seen.set(w, mondayOf(d));
  }
  return [...seen.entries()].map(([week, monday]) => ({ week, monday }));
}

// Semaine à afficher quand aucune n'est demandée : celle d'aujourd'hui,
// bornée à la période.
//
// Le défaut était « la première semaine qui porte une inscription », donc la
// plus ancienne : les vues s'ouvraient figées sur un passé révolu, et il
// fallait cliquer autant de fois que de semaines écoulées pour revenir au
// présent. Un tableau de bord parle d'abord d'aujourd'hui.
//
// Hors période : avant, la première semaine ; après, la dernière. Si la
// semaine du jour ne figure pas dans la liste (vacances, jours fermés), on
// prend la suivante qui y figure — jamais une précédente.
export function semaineParDefaut(params, weeks, aujourdHui = dateDuJour()) {
  if (!weeks?.length) return null;
  const ref = aujourdHui < params.periodStart ? params.periodStart
    : aujourdHui > params.periodEnd ? params.periodEnd : aujourdHui;
  const lundi = mondayOf(ref);
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
