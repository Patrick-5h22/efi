// Tableau de bord : indicateurs clés, anomalies, prochaines activités.

import { app, esc } from '../app.js';
import { memberName } from '../store.js';
import { workingDays, periodWeeks, fmtDateShort, fmtTime, isoWeek } from '../dates.js';

export function renderDashboard(main) {
  const state = app.state;
  const { rows, theoryTesters } = app.schedule;
  const days = workingDays(state.params);
  const openCount = state.openDays.filter((d) => days.includes(d)).length;
  const errRows = rows.filter((r) => r.errors.length);
  const stagiaires = new Set(rows.map((r) => r.insc.stagiaire.toLowerCase())).size;
  const weeks = periodWeeks(state.params);

  // Prochaines activités (à partir du premier jour planifié)
  const upcoming = rows
    .filter((r) => r.insc.datePratique)
    .sort((a, b) => a.insc.datePratique.localeCompare(b.insc.datePratique) || (a.insc.debutPratique ?? 0) - (b.insc.debutPratique ?? 0))
    .slice(0, 8);

  // Occupation : créneaux occupés / disponibles sur jours ouverts
  const slotsPerDay = (state.params.dayEnd - state.params.dayStart) / state.params.slotMinutes;
  const totalSlots = openCount * slotsPerDay;
  let busySlots = 0;
  for (const r of rows) {
    if (r.insc.datePratique && r.insc.debutPratique != null) busySlots += r.duree / state.params.slotMinutes;
    if (r.insc.dateTestPratique && r.insc.debutTestPratique != null) busySlots += state.params.practicalTestDuration / state.params.slotMinutes;
  }
  const occupation = totalSlots ? Math.min(100, Math.round((busySlots / totalSlots) * 100)) : 0;

  main.innerHTML = `
    <div class="page-header">
      <h1>Tableau de bord</h1>
      <span class="sub">Formations pratiques & tests — ${fmtDateShort(state.params.periodStart)} → ${fmtDateShort(state.params.periodEnd)}</span>
      <div class="page-actions">
        <a class="btn" href="#/inscriptions" id="quick-add">➕ Inscrire un stagiaire</a>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="kpi-value">${rows.length}</div><div class="kpi-label">Inscriptions</div></div>
      <div class="kpi"><div class="kpi-value">${stagiaires}</div><div class="kpi-label">Stagiaires</div></div>
      <div class="kpi ${errRows.length ? 'kpi-alert' : 'kpi-ok'}"><div class="kpi-value">${errRows.length ? errRows.length : '✓'}</div><div class="kpi-label">${errRows.length ? 'Lignes en anomalie' : 'Aucune anomalie'}</div></div>
      <div class="kpi"><div class="kpi-value">${openCount}<span style="font-size:14px;color:var(--text-dim)">/${days.length}</span></div><div class="kpi-label">Jours EFI ouverts</div></div>
      <div class="kpi"><div class="kpi-value">${occupation}%</div><div class="kpi-label">Occupation des jours ouverts</div></div>
    </div>

    ${errRows.length ? `
    <div class="card">
      <h2>⚠ Anomalies à corriger</h2>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>N°</th><th>Stagiaire</th><th>Formation</th><th>Date</th><th>Anomalies</th></tr></thead>
          <tbody>
            ${errRows.slice(0, 10).map((r) => `
              <tr class="row-error">
                <td>${r.insc.id}</td>
                <td><b>${esc(r.insc.stagiaire)}</b></td>
                <td>${esc(r.formation?.label || '')}</td>
                <td>${fmtDateShort(r.insc.datePratique)}</td>
                <td><ul class="status-errors">${r.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      ${errRows.length > 10 ? `<p class="muted">… et ${errRows.length - 10} autre(s) — voir <a href="#/inscriptions">Inscriptions</a>.</p>` : ''}
    </div>` : ''}

    <div class="card">
      <h2>📆 Prochaines activités</h2>
      ${upcoming.length ? `
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Date</th><th>Sem.</th><th>Stagiaire</th><th>Formation</th><th>Pratique</th><th>Test pratique</th><th>Formateur</th></tr></thead>
          <tbody>
            ${upcoming.map((r) => `
              <tr>
                <td>${fmtDateShort(r.insc.datePratique)}</td>
                <td><a href="#/semaine/${r.semaine}">S${r.semaine}</a></td>
                <td><b>${esc(r.insc.stagiaire)}</b></td>
                <td>${esc(r.formation?.label || '')}</td>
                <td>${fmtTime(r.insc.debutPratique)} → ${fmtTime(r.finPratique)}</td>
                <td>${r.insc.dateTestPratique ? `${fmtDateShort(r.insc.dateTestPratique)} ${fmtTime(r.insc.debutTestPratique)}` : '<span class="muted">—</span>'}</td>
                <td>${esc(memberName(state, r.formateurEffectif) || '—')}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : `<p class="muted">Aucune inscription. Commencez par <a href="#/inscriptions">inscrire un stagiaire</a>
        ou ouvrez des <a href="#/jours">jours EFI</a>, puis cliquez sur un créneau vert d'une <a href="#/semaine/${weeks[0].week}">grille semaine</a>.</p>`}
    </div>

    <div class="card">
      <h2>🗓 Accès rapide aux semaines</h2>
      <div class="form-row">
        ${weeks.map((w) => {
          const n = rows.filter((r) => r.semaine === w.week).length;
          return `<a class="btn ${n ? '' : 'btn-secondary'}" href="#/semaine/${w.week}" style="font-size:12px">S${w.week}${n ? ` (${n})` : ''}</a>`;
        }).join('')}
      </div>
    </div>
  `;
}
