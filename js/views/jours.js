// Jours EFI : calendrier d'ouverture du plateau technique (§4 des Paramètres)
// + affectation des intervenants jour par jour (onglet « Jours ouvrés »).

import { app, esc } from '../app.js';
import { memberName } from '../store.js';
import { workingDays, parseISO, fmtDateShort, dayOfWeek, isoWeek } from '../dates.js';

export function renderJours(main) {
  const state = app.state;
  const days = workingDays(state.params);
  const openSet = new Set(state.openDays);
  const openCount = state.openDays.filter((d) => days.includes(d)).length;

  main.innerHTML = `
    <div class="page-header">
      <h1>Jours EFI</h1>
      <span class="sub">${days.length} jours ouvrés sur la période — ${openCount} jour(s) d'ouverture du plateau technique</span>
    </div>

    <div class="card">
      <h2>Calendrier d'ouverture</h2>
      <p class="muted">Cliquer sur un jour pour ouvrir/fermer le plateau. Seuls les jours ouverts offrent des créneaux (vert)
      sur les grilles de semaine ; une inscription sur un jour fermé est signalée en rouge dans le STATUT.</p>
      <div class="months">${monthsHTML(state, days, openSet)}</div>
    </div>

    <div class="card">
      <h2>Affectation et présence des intervenants (jour par jour)</h2>
      <p class="muted">« Présents » : les intervenants disponibles ce jour-là (« Tous » par défaut) — l'affectation automatique
      ne choisit que parmi eux, et un intervenant positionné un jour où il n'est pas présent est signalé en anomalie.
      L'intervenant affecté est prioritaire dans l'affectation automatique ; une même personne affectée
      formateur ET testeur le même jour est signalée. « Testeur théorie (auto) » = testeur retenu pour le créneau théorie du jour.</p>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Jour</th><th>Sem.</th><th>Ouvert EFI</th><th>Présents</th><th>Formateur affecté</th><th>Testeur affecté</th><th>Testeur théorie (auto)</th><th>Activité</th></tr></thead>
          <tbody>${assignRowsHTML(state, days, openSet)}</tbody>
        </table>
      </div>
    </div>
  `;

  main.querySelectorAll('[data-toggle]').forEach((td) => {
    const toggle = () => {
      const d = td.dataset.toggle;
      if (openSet.has(d)) state.openDays = state.openDays.filter((x) => x !== d);
      else state.openDays.push(d);
      state.openDays.sort();
      app.commit();
      // Rendre le focus au jour cliqué après re-rendu
      main.querySelector(`[data-toggle="${d}"]`)?.focus();
    };
    td.addEventListener('click', toggle);
    td.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  });

  main.querySelectorAll('select[data-assign]').forEach((sel) => {
    sel.addEventListener('change', () => {
      const [date, role] = sel.dataset.assign.split('|');
      state.dayAssignments[date] = state.dayAssignments[date] || {};
      state.dayAssignments[date][role] = sel.value || null;
      app.commit();
    });
  });

  // Présence : case « Tous » (clé absente) ou sélection individuelle
  main.querySelectorAll('input[data-presall]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const date = cb.dataset.presall;
      if (cb.checked) delete state.dayPresence[date];
      else state.dayPresence[date] = state.team.filter((m) => m.name.trim()).map((m) => m.id);
      app.commit();
    });
  });
  main.querySelectorAll('input[data-pres]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const [date, id] = cb.dataset.pres.split('|');
      const all = state.team.filter((m) => m.name.trim()).map((m) => m.id);
      let list = state.dayPresence[date] || [...all];
      list = cb.checked ? [...new Set([...list, id])] : list.filter((x) => x !== id);
      // Tout le monde coché → retour au mode « Tous » (clé absente)
      if (all.every((x) => list.includes(x))) delete state.dayPresence[date];
      else state.dayPresence[date] = list;
      app.commit();
    });
  });
}

const MONTH_NAMES = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function monthsHTML(state, days, openSet) {
  const holidays = new Set((state.params.holidays || []).map((h) => h.date || h));
  // Regrouper les jours ouvrés par mois
  const byMonth = new Map();
  for (const d of days) {
    const key = d.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(d);
  }
  // Ajouter les fériés pour affichage
  for (const h of holidays) {
    const key = h.slice(0, 7);
    if (byMonth.has(key)) { byMonth.get(key).push(h); byMonth.get(key).sort(); }
  }

  return [...byMonth.entries()].map(([key, list]) => {
    const [y, m] = key.split('-').map(Number);
    // Semaines du mois (lun-ven)
    const weeks = new Map();
    for (const d of list) {
      const w = isoWeek(d);
      if (!weeks.has(w)) weeks.set(w, {});
      weeks.get(w)[dayOfWeek(d)] = d;
    }
    const rows = [...weeks.values()].map((week) => {
      return '<tr>' + [1, 2, 3, 4, 5].map((dow) => {
        const d = week[dow];
        if (!d) return '<td class="cal-empty"></td>';
        const num = parseISO(d).getUTCDate();
        if (holidays.has(d)) return `<td class="cal-holiday" title="Férié">${num}</td>`;
        const open = openSet.has(d);
        return `<td class="${open ? 'cal-open' : 'cal-closed'}" data-toggle="${d}" tabindex="0" role="button" aria-pressed="${open}" title="${fmtDateShort(d)} — cliquer pour ${open ? 'fermer' : 'ouvrir'}">${num}${open ? ' ✓' : ''}</td>`;
      }).join('') + '</tr>';
    }).join('');

    return `<div class="month">
      <h3>${MONTH_NAMES[m - 1]} ${y}</h3>
      <table class="cal">
        <thead><tr><th>Lun</th><th>Mar</th><th>Mer</th><th>Jeu</th><th>Ven</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }).join('');
}

function assignRowsHTML(state, days, openSet) {
  const { rows, theoryTesters } = app.schedule;

  const memberOptions = (selected) => '<option value="">— auto —</option>' + state.team
    .filter((m) => m.name.trim())
    .map((m) => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${esc(m.name)}</option>`).join('');

  return days.map((date) => {
    const open = openSet.has(date);
    const a = state.dayAssignments[date] || {};
    const sameBoth = a.formateur && a.formateur === a.testeur;
    const nPratique = rows.filter((r) => !r.cancelled && r.insc.datePratique === date).length;
    const nTests = rows.filter((r) => !r.cancelled && r.insc.dateTestPratique === date).length;
    const nTheorie = app.schedule.theoryCandidates(date);
    const activity = [
      nPratique ? `${nPratique} pratique(s)` : '',
      nTests ? `${nTests} test(s)` : '',
      nTheorie ? `théorie (${nTheorie})` : '',
    ].filter(Boolean).join(', ') || '<span class="muted">—</span>';

    const present = state.dayPresence[date] || null; // null = tous
    const members = state.team.filter((m) => m.name.trim());
    const presenceCell = open ? `
      <label class="pres-all"><input type="checkbox" data-presall="${date}" ${!present ? 'checked' : ''}> Tous</label>
      <span class="pres-list" ${!present ? 'hidden' : ''}>
        ${members.map((m) => `<label><input type="checkbox" data-pres="${date}|${m.id}" ${!present || present.includes(m.id) ? 'checked' : ''}> ${esc(m.name.split(' ')[0])}</label>`).join('')}
      </span>` : '<span class="muted">—</span>';

    return `<tr ${sameBoth ? 'class="row-error" title="Même personne formateur ET testeur le même jour"' : ''} ${!open ? 'style="opacity:.55"' : ''}>
      <td>${fmtDateShort(date)}</td>
      <td>S${isoWeek(date)}</td>
      <td>${open ? '<span class="badge badge-ok">OUI</span>' : '<span class="badge badge-warn">NON</span>'}</td>
      <td class="pres-cell">${presenceCell}</td>
      <td><select data-assign="${date}|formateur" ${!open ? 'disabled' : ''}>${memberOptions(a.formateur)}</select></td>
      <td><select data-assign="${date}|testeur" ${!open ? 'disabled' : ''}>${memberOptions(a.testeur)}</select>${sameBoth ? ' <span class="badge badge-error">⚠</span>' : ''}</td>
      <td>${theoryTesters.has(date) ? esc(memberName(state, theoryTesters.get(date)) || '?') : '<span class="muted">—</span>'}</td>
      <td>${activity}</td>
    </tr>`;
  }).join('');
}
