// Export iCalendar (.ics) des réservations : formations pratiques,
// tests pratiques et créneaux théorie, importable dans Outlook / Google Agenda.

import { memberName } from './store.js';
import { fmtTime } from './dates.js';

function icsDate(dateISO, minutes) {
  const [y, m, d] = dateISO.split('-');
  const h = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mn = String(minutes % 60).padStart(2, '0');
  return `${y}${m}${d}T${h}${mn}00`;
}

function icsEscape(s) {
  return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function event(uid, dateISO, start, end, summary, description) {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}@efi-planning`,
    `DTSTART;TZID=Europe/Paris:${icsDate(dateISO, start)}`,
    `DTEND;TZID=Europe/Paris:${icsDate(dateISO, end)}`,
    `SUMMARY:${icsEscape(summary)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    'END:VEVENT',
  ];
}

// Génère le contenu .ics pour un ensemble de lignes calculées (schedule.rows)
export function buildICS(state, schedule, { onlyDates = null } = {}) {
  const params = state.params;
  const keep = (d) => d && (!onlyDates || onlyDates.has(d));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//EFI Planning//FR',
    'CALSCALE:GREGORIAN',
  ];

  for (const row of schedule.rows) {
    if (row.cancelled) continue;
    const i = row.insc;
    const cat = row.formation ? row.formation.label.replace('Pratique ', '') : '?';
    if (keep(i.datePratique) && i.debutPratique != null) {
      const exam = row.formation?.testOnly;
      lines.push(...event(`practice-${i.id}`, i.datePratique, i.debutPratique, row.finPratique,
        `${exam ? 'Épreuve' : 'Formation'} ${cat} — ${i.stagiaire}`,
        exam
          ? `Testeur : ${memberName(state, row.testeurEffectif) || 'à affecter'} (${fmtTime(i.debutPratique)}–${fmtTime(row.finPratique)})`
          : `Formateur : ${memberName(state, row.formateurEffectif) || 'à affecter'} (${fmtTime(i.debutPratique)}–${fmtTime(row.finPratique)})`));
    }
    if (keep(i.dateTestPratique) && i.debutTestPratique != null && row.formation?.tests) {
      lines.push(...event(`test-${i.id}`, i.dateTestPratique, i.debutTestPratique, row.finTestPratique,
        `Test pratique ${cat} — ${i.stagiaire}`,
        `Testeur : ${memberName(state, row.testeurEffectif) || 'à affecter'}`));
    }
  }

  // Théorie : un événement de groupe par jour
  for (const [date, testerId] of schedule.theoryTesters) {
    if (!keep(date)) continue;
    const n = schedule.theoryCandidates(date);
    if (!n) continue;
    lines.push(...event(`theory-${date}`, date, params.theoryTime, params.theoryTime + params.theoryDuration,
      `Test théorique — ${n} candidat(s)`,
      `Testeur : ${memberName(state, testerId) || 'à affecter'}`));
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function downloadICS(content, filename) {
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
