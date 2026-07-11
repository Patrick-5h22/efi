// Tableau de bord : indicateurs clés, anomalies, prochaines activités.

import { app, esc, render } from '../app.js';
import { memberName } from '../store.js';
import { workingDays, periodWeeks, fmtDateShort, fmtTime, isoWeek, weekDays, fmtDateDay } from '../dates.js';
import { occupancyByDay, occupationSummary, OCCUPATION_SCOPES } from '../engine.js';
import { getKpiScope, setKpiScope } from '../prefs.js';
import { openInscriptionForm } from './form.js';

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

  // Occupation : créneaux occupés / disponibles, sur la portée choisie
  // (période / semaine / mois — un clic sur la carte change, choix mémorisé)
  const scope = getKpiScope();
  const occ = occupationSummary(state, app.schedule, scope);
  const occLabel = scope === 'semaine' ? `semaine S${isoWeek(occ.ref)}`
    : scope === 'mois' ? `${MONTHS_SHORT[Number(occ.ref.slice(5, 7)) - 1]} ${occ.ref.slice(0, 4)}`
    : 'jours ouverts (période)';
  const nbPre = rows.filter((r) => r.insc.statut === 'pre').length;

  main.innerHTML = `
    <div class="page-header">
      <h1>Tableau de bord</h1>
      <span class="sub">Formations pratiques & tests — ${fmtDateShort(state.params.periodStart)} → ${fmtDateShort(state.params.periodEnd)}</span>
      <div class="page-actions">
        <a class="btn" href="#/inscriptions" id="quick-add">➕ Inscrire un stagiaire</a>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="kpi-value">${rows.length}</div><div class="kpi-label">📝 Inscriptions${nbPre ? ` — dont ${nbPre} pré-rés.` : ''}</div></div>
      <div class="kpi"><div class="kpi-value">${stagiaires}</div><div class="kpi-label">🧑‍🎓 Stagiaires</div></div>
      <div class="kpi ${errRows.length ? 'kpi-alert' : 'kpi-ok'}"><div class="kpi-value">${errRows.length ? errRows.length : '✓'}</div><div class="kpi-label">${errRows.length ? '⚠ Lignes en anomalie' : 'Aucune anomalie'}</div></div>
      <div class="kpi"><div class="kpi-value">${openCount}<span style="font-size:14px;color:var(--muted-foreground)">/${days.length}</span></div><div class="kpi-label">📆 Jours EFI ouverts</div></div>
      <div class="kpi kpi-click" id="kpi-occupation" role="button" tabindex="0"
           title="Portée : ${occLabel} (${occ.days} j ouverts) — cliquer pour alterner période / semaine / mois, choix mémorisé sur votre profil">
        <div class="kpi-value">${occ.pct}%<span style="font-size:13px;color:var(--muted-foreground)"> · ${occ.hours.toFixed(0)} h</span></div>
        <div class="kpi-label">🔥 Occupation — ${occLabel} <span class="kpi-cycle">⟳</span></div>
      </div>
    </div>

    <div class="card">
      <h2>🔥 Occupation de la période</h2>
      ${heatmapHTML(state, weeks)}
    </div>

    ${errRows.length ? `
    <div class="card">
      <h2>⚠ Anomalies à corriger</h2>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>N°</th><th>Stagiaire</th><th>Formation</th><th>Date</th><th>Anomalies</th><th></th></tr></thead>
          <tbody>
            ${errRows.slice(0, 10).map((r) => `
              <tr class="row-error">
                <td>${r.insc.id}</td>
                <td><b>${esc(r.insc.stagiaire)}</b></td>
                <td>${esc(r.formation?.label || '')}</td>
                <td>${fmtDateShort(r.insc.datePratique)}</td>
                <td><ul class="status-errors">${r.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></td>
                <td><button class="btn btn-secondary btn-sm" data-edit="${r.insc.id}" title="Corriger">✏️</button></td>
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
  `;

  // Carte occupation : un clic passe à la portée suivante (mémorisée)
  const kpiOcc = main.querySelector('#kpi-occupation');
  const cycleScope = () => {
    const next = OCCUPATION_SCOPES[(OCCUPATION_SCOPES.indexOf(getKpiScope()) + 1) % OCCUPATION_SCOPES.length];
    setKpiScope(next);
    render();
  };
  kpiOcc.addEventListener('click', cycleScope);
  kpiOcc.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycleScope(); }
  });

  main.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openInscriptionForm({ id: Number(b.dataset.edit) })));
  main.querySelectorAll('.hm-cell[data-week], .hm-week').forEach((el) => {
    const go = () => { location.hash = '#/semaine/' + el.dataset.week; };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}

// ---------------------------------------------------------------------------
// Heatmap : 1 colonne par semaine, 1 ligne par jour (lun-ven), couleur =
// taux d'occupation des créneaux offerts (formateur + testeur).
// ---------------------------------------------------------------------------
const DAY_LABELS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

function heatmapHTML(state, weeks) {
  const occ = occupancyByDay(state, app.schedule);
  const openSet = new Set(state.openDays);
  const holidays = new Set((state.params.holidays || []).map((h) => h.date || h));
  const level = (ratio) => ratio <= 0 ? 0 : ratio <= 0.25 ? 1 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 3 : 4;

  const cols = weeks.map(({ week, monday }) => {
    const cells = weekDays(monday).map((date) => {
      const inPeriod = date >= state.params.periodStart && date <= state.params.periodEnd;
      if (!inPeriod) return '<span class="hm-cell hm-out"></span>';
      if (holidays.has(date)) return `<span class="hm-cell hm-holiday" title="${fmtDateDay(date)} — férié"></span>`;
      if (!openSet.has(date)) return `<span class="hm-cell hm-closed" title="${fmtDateDay(date)} — fermé (EFI)"></span>`;
      const d = occ.get(date) || { busy: 0, total: 0, ratio: 0, errors: 0 };
      const dayRows = app.schedule.rows.filter((r) => !r.cancelled && (r.insc.datePratique === date || r.insc.dateTestPratique === date));
      const allPre = dayRows.length > 0 && dayRows.every((r) => r.insc.statut === 'pre');
      const pct = Math.round(d.ratio * 100);
      const hours = (d.busy * state.params.slotMinutes / 60).toFixed(1).replace('.', ',').replace(',0', '');
      const title = `${fmtDateDay(date)} — ${pct} % (${hours} h réservées)${d.errors ? ` — ⚠ ${d.errors} anomalie(s)` : ''}`;
      return `<span class="hm-cell hm-${level(d.ratio)} ${d.errors ? 'hm-alert' : ''} ${allPre ? 'hm-pre' : ''}" data-week="${week}"
        tabindex="0" role="button" title="${title}${allPre ? ' — pré-réservé' : ''}" aria-label="${title}"></span>`;
    }).join('');
    return `<div class="hm-col">${cells}<span class="hm-week" data-week="${week}">${week}</span></div>`;
  }).join('');

  // Ligne des mois : un label au début de chaque mois (au moins 2 semaines visibles)
  let lastMonth = null;
  const monthCells = weeks.map(({ monday }) => {
    // Mois du jeudi de la semaine (représentatif, évite les chevauchements en bord de mois)
    const thursday = weekDays(monday)[3];
    const m = Number(thursday.slice(5, 7));
    if (m !== lastMonth) { lastMonth = m; return `<span class="hm-month">${MONTHS_SHORT[m - 1]}</span>`; }
    return '<span class="hm-month"></span>';
  }).join('');

  return `
    <div class="hm-wrap">
      <div class="hm-days"><span></span>${DAY_LABELS.map((d) => `<span>${d}</span>`).join('')}<span></span></div>
      <div>
        <div class="hm-months">${monthCells}</div>
        <div class="hm-grid">${cols}</div>
      </div>
    </div>
    <div class="legend" style="margin-top:10px">
      <span>Occupation :</span>
      <span>0 %</span>
      ${[0, 1, 2, 3, 4].map((l) => `<span class="chip hm-${l}" style="border-radius:3px"></span>`).join('')}
      <span>100 %</span>
      <span style="margin-left:12px"><span class="chip hm-closed"></span>Fermé</span>
      <span><span class="chip hm-holiday"></span>Férié</span>
      <span><span class="chip hm-1 hm-alert"></span>Anomalie</span>
      <span class="muted">— cliquer sur un jour ou un n° ouvre la semaine</span>
    </div>
  `;
}
