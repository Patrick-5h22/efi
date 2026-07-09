// Grilles hebdomadaires FORMATEUR / TESTEUR — équivalent des onglets « Semaine 36 » à « Semaine 53 ».
// Vert = disponible (clic = inscrire), rouge = occupé, jaune = théorie, gris = fermé.

import { app, esc, navigate } from '../app.js';
import { memberName } from '../store.js';
import { periodWeeks, weekDays, daySlots, fmtTime, fmtDateDay, fmtDateShort, isWeekend } from '../dates.js';
import { openInscriptionForm } from './form.js';

export function renderSemaine(main, args) {
  const state = app.state;
  const weeks = periodWeeks(state.params);
  const weekNum = Number(args[0]) || weeks[0].week;
  const week = weeks.find((w) => w.week === weekNum) || weeks[0];
  const days = weekDays(week.monday).filter((d) => d >= state.params.periodStart && d <= state.params.periodEnd || true);
  const idx = weeks.findIndex((w) => w.week === week.week);

  main.innerHTML = `
    <div class="page-header">
      <h1>Semaine ${week.week}</h1>
      <span class="sub">du ${fmtDateShort(days[0])} au ${fmtDateShort(days[4])}</span>
      <div class="page-actions">
        <button class="btn btn-secondary" id="w-prev" ${idx === 0 ? 'disabled' : ''}>← S${idx > 0 ? weeks[idx - 1].week : ''}</button>
        <select id="w-select">${weeks.map((w) => `<option value="${w.week}" ${w.week === week.week ? 'selected' : ''}>Semaine ${w.week}</option>`).join('')}</select>
        <button class="btn btn-secondary" id="w-next" ${idx === weeks.length - 1 ? 'disabled' : ''}>S${idx < weeks.length - 1 ? weeks[idx + 1].week : ''} →</button>
        <a class="btn btn-secondary" href="#/synthese/${week.week}">📋 Synthèse</a>
        <button class="btn" id="btn-add">➕ Inscrire</button>
      </div>
    </div>

    <div class="legend no-print">
      <span><span class="chip" style="background:var(--free)"></span>Disponible (cliquer pour inscrire)</span>
      <span><span class="chip" style="background:var(--busy)"></span>Occupé</span>
      <span><span class="chip" style="background:var(--theory-bg);border-color:#e2c14d"></span>Théorie</span>
      <span><span class="chip" style="background:var(--closed)"></span>Fermé</span>
    </div>

    <div class="card">
      <h2>👷 FORMATEUR — formations pratiques</h2>
      <div class="grid-wrap">${gridHTML(state, days, 'F')}</div>
    </div>
    <div class="card">
      <h2>🔎 TESTEUR — test théorique & tests pratiques</h2>
      <div class="grid-wrap">${gridHTML(state, days, 'T')}</div>
    </div>
  `;

  main.querySelector('#w-select').addEventListener('change', (e) => navigate(`semaine/${e.target.value}`));
  main.querySelector('#w-prev')?.addEventListener('click', () => navigate(`semaine/${weeks[idx - 1].week}`));
  main.querySelector('#w-next')?.addEventListener('click', () => navigate(`semaine/${weeks[idx + 1].week}`));
  main.querySelector('#btn-add').addEventListener('click', () => openInscriptionForm());

  main.querySelectorAll('td.slot-free').forEach((td) => {
    td.addEventListener('click', () => {
      openInscriptionForm(td.dataset.kind === 'F'
        ? { datePratique: td.dataset.date, debutPratique: Number(td.dataset.time) }
        : { dateTestPratique: td.dataset.date, debutTestPratique: Number(td.dataset.time) });
    });
    td.title = td.dataset.kind === 'F'
      ? 'Inscrire une formation pratique sur ce créneau'
      : 'Réserver un test pratique sur ce créneau';
  });
}

// Construit la grille (kind = 'F' formateur, 'T' testeur)
function gridHTML(state, days, kind) {
  const slots = daySlots(state.params);
  const { rows, theoryTesters } = app.schedule;
  const openSet = new Set(state.openDays);
  const theoryEnd = state.params.theoryTime + state.params.theoryDuration;

  const head = `<tr><th class="day-col">Jour</th><th class="who-col">Intervenant</th>${slots.map((t) => `<th>${fmtTime(t)}</th>`).join('')}</tr>`;

  const body = days.map((date) => {
    const open = openSet.has(date);
    const holiday = (state.params.holidays || []).some((h) => (h.date || h) === date);
    const assign = state.dayAssignments[date] || {};
    const assignedId = kind === 'F' ? assign.formateur : assign.testeur;
    let who;
    if (!open) who = '—';
    else if (assignedId) who = esc(memberName(state, assignedId));
    else if (kind === 'T' && theoryTesters.get(date)) who = esc(memberName(state, theoryTesters.get(date))) + ' <span class="muted">(auto)</span>';
    else who = '<span class="who-missing">⚠ à affecter</span>';

    const cells = slots.map((t) => {
      if (isWeekend(date) || holiday) return `<td class="slot-closed">FÉRIÉ</td>`;
      if (!open) return `<td class="slot-closed">FERMÉ</td>`;
      const slotEnd = t + state.params.slotMinutes;

      // Théorie (grille testeur uniquement)
      if (kind === 'T' && theoryTesters.has(date)
        && t < theoryEnd && slotEnd > state.params.theoryTime) {
        const n = rows.filter((r) => r.insc.dateTheorie === date).length;
        return `<td class="slot-theory"><span class="slot-name">THÉORIE (${n} cand.)</span><span class="slot-detail">Testeur : ${esc(memberName(state, theoryTesters.get(date)) || '?')}</span></td>`;
      }

      // Occupations
      const occupants = rows.filter((r) => {
        const i = r.insc;
        if (kind === 'F') {
          return i.datePratique === date && i.debutPratique != null
            && i.debutPratique < slotEnd && r.finPratique > t;
        }
        return i.dateTestPratique === date && i.debutTestPratique != null
          && i.debutTestPratique < slotEnd && r.finTestPratique > t;
      });

      if (occupants.length) {
        const label = occupants.map((r) => `<span class="slot-name">${esc(r.insc.stagiaire)}</span><span class="slot-detail">${esc(kind === 'F' ? (r.formation?.label || '') : 'Test ' + (r.formation?.label?.replace('Pratique ', '') || ''))}</span><span class="slot-detail">${esc(kind === 'F' ? 'Form. : ' + (memberName(state, r.formateurEffectif) || '?') : 'Testeur : ' + (memberName(state, r.testeurEffectif) || '?'))}</span>`).join('<hr style="margin:2px 0;border:none;border-top:1px dashed #c77">');
        return `<td class="slot-busy">${label}</td>`;
      }

      return `<td class="slot-free" data-date="${date}" data-time="${t}" data-kind="${kind}"></td>`;
    }).join('');

    return `<tr><td class="day-col">${fmtDateDay(date)}</td><td class="who-col">${who}</td>${cells}</tr>`;
  }).join('');

  return `<table class="planning">${head}${body}</table>`;
}
