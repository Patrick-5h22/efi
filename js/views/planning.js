// Plannings globaux FORMATEUR / TESTEUR : 86 jours × 18 créneaux
// (équivalent des onglets « Planning Formateur » et « Planning Testeur »).

import { app, esc } from '../app.js';
import { memberName } from '../store.js';
import { workingDays, daySlots, fmtTime, fmtDateDay, isoWeek } from '../dates.js';

export function renderPlanning(main, args, kind) {
  const state = app.state;
  const days = workingDays(state.params);
  const slots = daySlots(state.params);
  const { rows, theoryTesters } = app.schedule;
  const openSet = new Set(state.openDays);
  const theoryEnd = state.params.theoryTime + state.params.theoryDuration;
  const title = kind === 'F' ? 'Planning formateur' : 'Planning testeur';

  const head = `<tr><th class="day-col">Jour</th>${slots.map((t) => `<th>${fmtTime(t)}</th>`).join('')}</tr>`;
  let lastWeek = null;

  const body = days.map((date) => {
    const open = openSet.has(date);
    const week = isoWeek(date);
    let weekSep = '';
    if (week !== lastWeek) {
      weekSep = `<tr><td class="day-col" colspan="${slots.length + 1}" style="background:var(--muted);font-weight:700">Semaine ${week} <a href="#/semaine/${week}" class="no-print" style="font-weight:400;font-size:11px">→ grille</a></td></tr>`;
      lastWeek = week;
    }

    const cells = slots.map((t) => {
      if (!open) return `<td class="slot-off"></td>`;
      const slotEnd = t + state.params.slotMinutes;

      if (kind === 'T' && theoryTesters.has(date) && t < theoryEnd && slotEnd > state.params.theoryTime) {
        const n = app.schedule.theoryCandidates(date);
        return `<td class="slot-theory">THÉORIE (${n} cand.)</td>`;
      }

      const occupants = rows.filter((r) => {
        if (r.cancelled) return false;
        const i = r.insc;
        if (kind === 'F') return !r.formation?.testOnly && i.datePratique === date && i.debutPratique != null && i.debutPratique < slotEnd && r.finPratique > t;
        if (r.formation?.testOnly) return i.datePratique === date && i.debutPratique != null && i.debutPratique < slotEnd && r.finPratique > t;
        return i.dateTestPratique === date && i.debutTestPratique != null && i.debutTestPratique < slotEnd && r.finTestPratique > t;
      });

      if (!occupants.length) return `<td class="slot-free" style="cursor:default"></td>`;
      if (occupants.length > 1) return `<td class="slot-busy" title="${esc(occupants.map((o) => o.insc.stagiaire).join(' + '))}">${occupants.length} stagiaires</td>`;
      const r = occupants[0];
      const who = kind === 'F' ? r.formateurEffectif : r.testeurEffectif;
      return `<td class="slot-busy" title="${esc((r.formation?.label || '') + ' — ' + (memberName(state, who) || '?'))}">${esc(r.insc.stagiaire)}</td>`;
    }).join('');

    return `${weekSep}<tr><td class="day-col">${fmtDateDay(date)}${open ? '' : ' <span class="muted">(fermé)</span>'}</td>${cells}</tr>`;
  }).join('');

  main.innerHTML = `
    <div class="page-header">
      <h1>${title}</h1>
      <span class="sub">Vue globale des ${days.length} jours ouvrés — 1 ligne / jour, 1 colonne / créneau de 30 min. Rempli automatiquement depuis les inscriptions.</span>
      <div class="page-actions"><button class="btn btn-secondary" onclick="window.print()">🖨 Imprimer</button></div>
    </div>
    <div class="legend no-print">
      <span><span class="chip" style="background:var(--free)"></span>Disponible</span>
      <span><span class="chip" style="background:var(--busy)"></span>Occupé (nom du stagiaire)</span>
      ${kind === 'T' ? '<span><span class="chip" style="background:var(--theory-bg);border-color:#e2c14d"></span>Théorie</span>' : ''}
      <span><span class="chip" style="background:#f2f4f8"></span>Jour non ouvert</span>
    </div>
    <div class="card"><div class="grid-wrap"><table class="planning">${head}${body}</table></div></div>
  `;
}
