// Synthèse semaine : feuille de route chronologique imprimable
// (équivalent de l'onglet « Synthèse semaine »).

import { app, esc, navigate } from '../app.js';
import { memberName } from '../store.js';
import { periodWeeks, weekDays, fmtTime, fmtDateLong, fmtDateShort } from '../dates.js';
import { buildICS, downloadICS } from '../ics.js';

export function renderSynthese(main, args) {
  const state = app.state;
  const weeks = periodWeeks(state.params);
  const defaultWeek = app.schedule.rows.map((r) => r.semaine).filter(Boolean).sort((a, b) => a - b)[0] || weeks[0].week;
  const weekNum = Number(args[0]) || defaultWeek;
  const week = weeks.find((w) => w.week === weekNum) || weeks[0];
  const days = weekDays(week.monday);

  const events = buildEvents(state, days);

  main.innerHTML = `
    <div class="page-header">
      <h1>Synthèse semaine ${week.week}</h1>
      <span class="sub">du ${fmtDateShort(days[0])} au ${fmtDateShort(days[4])} — feuille de route à remettre au formateur et au testeur</span>
      <div class="page-actions">
        <select id="w-select">${weeks.map((w) => `<option value="${w.week}" ${w.week === week.week ? 'selected' : ''}>Semaine ${w.week}</option>`).join('')}</select>
        <a class="btn btn-secondary" href="#/semaine/${week.week}">🗓 Grilles</a>
        <button class="btn btn-secondary" id="btn-ics" title="Exporter la semaine au format calendrier (.ics)">📅 .ics</button>
        <button class="btn" id="btn-print">🖨 Imprimer</button>
      </div>
    </div>

    <div class="card">
      ${events.length ? syntheseTable(state, events) : '<p class="muted">Aucune activité planifiée cette semaine.</p>'}
    </div>
  `;

  main.querySelector('#w-select').addEventListener('change', (e) => navigate(`synthese/${e.target.value}`));
  main.querySelector('#btn-print').addEventListener('click', () => window.print());
  main.querySelector('#btn-ics').addEventListener('click', () => {
    const ics = buildICS(state, app.schedule, { onlyDates: new Set(days) });
    downloadICS(ics, `efi-semaine-${week.week}.ics`);
  });
}

function buildEvents(state, days) {
  const { rows } = app.schedule;
  const { theoryTesters } = app.schedule;
  const events = [];
  const daySet = new Set(days);

  for (const row of rows) {
    if (row.cancelled) continue;
    const i = row.insc;
    if (daySet.has(i.datePratique) && i.debutPratique != null) {
      // Formation « épreuve seule » (AIPR) : c'est une épreuve tenue par un testeur
      const exam = row.formation?.testOnly;
      events.push({
        date: i.datePratique, start: i.debutPratique, end: row.finPratique,
        stagiaire: i.stagiaire,
        action: exam ? `Épreuve — ${shortCat(row)}` : `Formation pratique — ${shortCat(row)}`,
        who: memberName(state, exam ? row.testeurEffectif : row.formateurEffectif) || '⚠',
        kind: exam ? 'test' : 'pratique',
      });
    }
    if (daySet.has(i.dateTestPratique) && i.debutTestPratique != null && row.formation?.tests) {
      events.push({
        date: i.dateTestPratique, start: i.debutTestPratique, end: row.finTestPratique,
        stagiaire: i.stagiaire, action: `Test pratique — ${shortCat(row)}`,
        who: memberName(state, row.testeurEffectif) || '⚠', kind: 'test',
      });
    }
  }

  // Théorie : un événement de groupe par jour concerné
  for (const date of days) {
    if (!theoryTesters.has(date)) continue;
    const candidates = [...new Set(rows.filter((r) => !r.cancelled && r.insc.dateTheorie === date).map((r) => r.insc.stagiaire))];
    if (!candidates.length) continue;
    events.push({
      date, start: state.params.theoryTime, end: state.params.theoryTime + state.params.theoryDuration,
      stagiaire: `Groupe — ${candidates.length} candidat(s) : ${candidates.join(', ')}`,
      action: 'TEST THÉORIQUE', who: memberName(state, theoryTesters.get(date)) || '⚠', kind: 'theorie',
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start || a.stagiaire.localeCompare(b.stagiaire));
  return events;
}

function shortCat(row) {
  return row.formation ? row.formation.label.replace('Pratique ', '') : '?';
}

function syntheseTable(state, events) {
  let lastDate = null;
  const body = events.map((e) => {
    let sep = '';
    if (e.date !== lastDate) {
      sep = `<tr class="day-sep"><td colspan="5">${fmtDateLong(e.date)}</td></tr>`;
      lastDate = e.date;
    }
    return sep + `
      <tr class="${e.kind === 'theorie' ? 'theory-row' : ''}">
        <td>${fmtTime(e.start)}</td>
        <td>${fmtTime(e.end)}</td>
        <td>${esc(e.stagiaire)}</td>
        <td>${esc(e.action)}</td>
        <td>${esc(e.who)}</td>
      </tr>`;
  }).join('');

  return `<table class="synthese">
    <thead><tr><th>Début</th><th>Fin</th><th>Stagiaire</th><th>Action</th><th>Intervenant</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}
