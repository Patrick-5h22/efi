// Import CSV des inscriptions : accepte le format exporté par l'application
// ainsi qu'un export CSV de l'onglet « Inscriptions » du classeur Excel.
// Séparateur ; ou , — en-têtes reconnues par mots-clés, dates JJ/MM/AAAA ou ISO.

import { parseTime } from './dates.js';

export function parseCSV(text, sep = null) {
  // Détection du séparateur sur la ligne d'en-tête
  const firstLine = text.slice(0, text.indexOf('\n') + 1 || text.length);
  if (!sep) sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';

  const rows = [];
  let row = [], field = '', inQuotes = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((f) => f.trim() !== '')) rows.push(row); }
  return rows;
}

function parseDate(s) {
  s = (s || '').trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

// Associe les colonnes par mots-clés dans l'en-tête (insensible aux accents/casse)
const COLUMN_PATTERNS = [
  ['stagiaire', /stagiaire/],
  ['formation', /^formation$|formation\b(?!.*(date|debut|fin))/],
  ['type', /^type/],
  ['datePratique', /date.*pratique(?!.*test)|pratique.*date(?!.*test)/],
  ['debutPratique', /debut.*pratique(?!.*test)/],
  ['dateTheorie', /date.*theo|theo.*date/],
  ['dateTestPratique', /date.*test|test.*date/],
  ['debutTestPratique', /debut.*test|test.*debut/],
  ['formateur', /^formateur/],
  ['testeur', /^testeur/],
];

function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

export function mapColumns(header) {
  const map = {};
  header.forEach((h, idx) => {
    const n = normalize(h);
    for (const [key, pattern] of COLUMN_PATTERNS) {
      if (map[key] == null && pattern.test(n)) { map[key] = idx; break; }
    }
  });
  return map;
}

// Convertit un libellé de formation en code (par libellé exact, code exact, ou inclusion)
function resolveFormation(formations, value) {
  const v = normalize(value || '');
  if (!v) return null;
  for (const f of formations) {
    if (normalize(f.code) === v || normalize(f.label) === v) return f.code;
  }
  for (const f of formations) {
    if (v.includes(normalize(f.label)) || normalize(f.label).includes(v)) return f.code;
  }
  return null;
}

function resolveMember(team, value) {
  const v = normalize(value || '');
  if (!v || !team) return null;
  return team.find((m) => normalize(m.name) === v)?.id
    || team.find((m) => normalize(m.name).includes(v) || v.includes(normalize(m.name)))?.id
    || null;
}

// Retourne { inscriptions: [...], skipped: [{line, reason}] }
export function importInscriptionsCSV(text, formations, team = null) {
  const rows = parseCSV(text);
  if (rows.length < 2) throw new Error('CSV vide ou sans données.');
  const map = mapColumns(rows[0]);
  if (map.stagiaire == null || map.formation == null) {
    throw new Error('Colonnes « Stagiaire » et « Formation » introuvables dans l’en-tête.');
  }
  const get = (row, key) => (map[key] != null ? (row[map[key]] || '').trim() : '');

  const inscriptions = [];
  const skipped = [];
  rows.slice(1).forEach((row, i) => {
    const line = i + 2;
    const stagiaire = get(row, 'stagiaire');
    if (!stagiaire) { skipped.push({ line, reason: 'stagiaire vide' }); return; }
    const formation = resolveFormation(formations, get(row, 'formation'));
    if (!formation) { skipped.push({ line, reason: `formation inconnue « ${get(row, 'formation')} »` }); return; }
    const type = /recycl/i.test(get(row, 'type')) ? 'Recyclage' : 'Initial';
    inscriptions.push({
      stagiaire, formation, type,
      datePratique: parseDate(get(row, 'datePratique')),
      debutPratique: parseTime(get(row, 'debutPratique')),
      dateTheorie: parseDate(get(row, 'dateTheorie')),
      dateTestPratique: parseDate(get(row, 'dateTestPratique')),
      debutTestPratique: parseTime(get(row, 'debutTestPratique')),
      formateurId: resolveMember(team, get(row, 'formateur')),
      testeurId: resolveMember(team, get(row, 'testeur')),
    });
  });
  return { inscriptions, skipped };
}
