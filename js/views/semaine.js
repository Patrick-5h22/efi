// Grilles hebdomadaires FORMATEUR / TESTEUR — équivalent des onglets « Semaine 36 » à « Semaine 53 ».
// Vert = disponible (clic = inscrire), rouge = occupé, jaune = théorie, gris = fermé.

import { app, esc, navigate } from '../app.js';
import { memberName } from '../store.js';
import { periodWeeks, weekDays, daySlots, fmtTime, fmtDateDay, fmtDateShort, isWeekend } from '../dates.js';
import { openInscriptionForm } from './form.js';

export function renderSemaine(main, args) {
  const state = app.state;
  const weeks = periodWeeks(state.params);
  const defaultWeek = app.schedule.rows.map((r) => r.semaine).filter(Boolean).sort((a, b) => a - b)[0] || weeks[0].week;
  const weekNum = Number(args[0]) || defaultWeek;
  const week = weeks.find((w) => w.week === weekNum) || weeks[0];
  const days = weekDays(week.monday);
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
        <button class="btn btn-secondary" onclick="window.print()">🖨</button>
        <button class="btn" id="btn-add">➕ Inscrire</button>
      </div>
    </div>

    <div class="legend no-print">
      <span><span class="chip" style="background:var(--free)"></span>Disponible (cliquer pour inscrire)</span>
      <span><span class="chip" style="background:var(--busy)"></span>Occupé</span>
      <span><span class="chip" style="background:var(--busy); outline:1px dashed var(--warn); outline-offset:-2px"></span>Pré-réservé</span>
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
    const open = () => openInscriptionForm(td.dataset.kind === 'F'
      ? { datePratique: td.dataset.date, debutPratique: Number(td.dataset.time) }
      : { dateTestPratique: td.dataset.date, debutTestPratique: Number(td.dataset.time) });
    td.addEventListener('click', open);
    td.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    td.title = `${fmtDateDay(td.dataset.date)} ${fmtTime(Number(td.dataset.time))} — ` + (td.dataset.kind === 'F'
      ? 'inscrire une formation pratique'
      : 'réserver un test pratique');
  });

  // Clic sur un créneau occupé = éditer l'inscription
  main.querySelectorAll('td.slot-busy[data-insc]').forEach((td) => {
    td.style.cursor = 'pointer';
    td.title = 'Modifier cette inscription';
    td.addEventListener('click', () => openInscriptionForm({ id: Number(td.dataset.insc) }));
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
    const inPeriod = date >= state.params.periodStart && date <= state.params.periodEnd;
    const open = openSet.has(date);
    const holiday = (state.params.holidays || []).some((h) => (h.date || h) === date);
    const assign = state.dayAssignments[date] || {};
    const assignedId = kind === 'F' ? assign.formateur : assign.testeur;

    // Intervenant du jour : affectation manuelle, sinon déduit de l'activité (auto)
    let who;
    if (!open || !inPeriod) who = '—';
    else if (assignedId) who = esc(memberName(state, assignedId));
    else {
      const autoIds = new Set();
      for (const r of rows) {
        if (r.cancelled) continue;
        if (kind === 'F' && r.insc.datePratique === date && r.formateurEffectif) autoIds.add(r.formateurEffectif);
        if (kind === 'T' && r.insc.dateTestPratique === date && r.testeurEffectif) autoIds.add(r.testeurEffectif);
        if (kind === 'T' && r.formation?.testOnly && r.insc.datePratique === date && r.testeurEffectif) autoIds.add(r.testeurEffectif);
      }
      if (kind === 'T' && theoryTesters.get(date)) autoIds.add(theoryTesters.get(date));
      who = autoIds.size
        ? [...autoIds].map((id) => esc(memberName(state, id))).join(', ') + ' <span class="muted">(auto)</span>'
        : '<span class="who-missing">⚠ à affecter</span>';
    }

    const cells = slots.map((t) => {
      if (!inPeriod) return `<td class="slot-closed">—</td>`;
      if (isWeekend(date) || holiday) return `<td class="slot-closed">FÉRIÉ</td>`;
      if (!open) return `<td class="slot-closed">FERMÉ</td>`;
      const slotEnd = t + state.params.slotMinutes;

      // Théorie (grille testeur uniquement)
      if (kind === 'T' && theoryTesters.has(date)
        && t < theoryEnd && slotEnd > state.params.theoryTime) {
        const n = app.schedule.theoryCandidates(date);
        return `<td class="slot-theory"><span class="slot-name">THÉORIE (${n} cand.)</span><span class="slot-detail">Testeur : ${esc(memberName(state, theoryTesters.get(date)) || '?')}</span></td>`;
      }

      // Occupations. Les formations « épreuve seule » (AIPR) occupent la
      // grille TESTEUR sur leur créneau (champs Pratique), jamais la grille
      // FORMATEUR.
      const occupants = rows.filter((r) => {
        if (r.cancelled) return false;
        const i = r.insc;
        if (kind === 'F') {
          return !r.formation?.testOnly && i.datePratique === date && i.debutPratique != null
            && i.debutPratique < slotEnd && r.finPratique > t;
        }
        if (r.formation?.testOnly) {
          return i.datePratique === date && i.debutPratique != null
            && i.debutPratique < slotEnd && r.finPratique > t;
        }
        return i.dateTestPratique === date && i.debutTestPratique != null
          && i.debutTestPratique < slotEnd && r.finTestPratique > t;
      });

      if (occupants.length) {
        const tLabel = (r) => r.formation?.testOnly ? (r.formation?.label || '') : 'Test ' + (r.formation?.label?.replace('Pratique ', '') || '');
        const label = occupants.map((r) => `<span class="slot-name">${esc(r.insc.stagiaire)}</span><span class="slot-detail">${esc(kind === 'F' ? (r.formation?.label || '') : tLabel(r))}</span><span class="slot-detail">${esc(kind === 'F' ? 'Form. : ' + (memberName(state, r.formateurEffectif) || '?') : 'Testeur : ' + (memberName(state, r.testeurEffectif) || '?'))}</span>`).join('<hr style="margin:2px 0;border:none;border-top:1px dashed var(--grid-line)">');
        const inscAttr = occupants.length === 1 ? ` data-insc="${occupants[0].insc.id}"` : '';
        const pre = occupants.every((r) => r.insc.statut === 'pre') ? ' slot-pre' : '';
        const tip = occupants.map((r) => `${r.insc.stagiaire} — ${r.formation?.label || ''}${r.insc.statut === 'pre' ? ' (pré-réservé)' : ''}`).join(' | ');
        return `<td class="slot-busy${pre}"${inscAttr} title="${esc(tip)}">${label}</td>`;
      }

      return `<td class="slot-free" data-date="${date}" data-time="${t}" data-kind="${kind}" tabindex="0" role="button" aria-label="Créneau libre ${fmtDateDay(date)} ${fmtTime(t)}"></td>`;
    }).join('');

    // Charge de formation pratique du jour (grille formateur)
    let loadInfo = '';
    if (kind === 'F' && open && inPeriod) {
      const load = rows.reduce((sum, r) => sum + (!r.cancelled && !r.formation?.testOnly && r.insc.datePratique === date && r.insc.debutPratique != null ? r.duree : 0), 0);
      if (load > 0) {
        const over = load > state.params.maxDailyLoad;
        loadInfo = `<br><span style="font-weight:400;font-size:10px;color:${over ? 'var(--error)' : 'var(--muted-foreground)'}">${fmtTime(load).replace(':', 'h')}${over ? ' ⚠' : ''} / ${fmtTime(state.params.maxDailyLoad).replace(':', 'h')}</span>`;
      }
    }
    return `<tr><td class="day-col">${fmtDateDay(date)}${loadInfo}</td><td class="who-col">${who}</td>${cells}</tr>`;
  }).join('');

  return `<table class="planning">${head}${body}</table>`;
}
