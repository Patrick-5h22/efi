// Vue Inscriptions : tableau complet (équivalent de l'onglet Inscriptions)
// avec filtres, statut détaillé et actions.

import { app, esc, toast } from '../app.js';
import { removeInscription, memberName } from '../store.js';
import { fmtTime, fmtDateShort, periodWeeks } from '../dates.js';
import { openInscriptionForm } from './form.js';

const filters = { search: '', week: '', status: '' };

export function renderInscriptions(main) {
  const state = app.state;
  const { rows } = app.schedule;
  const weeks = periodWeeks(state.params);

  const visible = rows.filter((row) => {
    if (filters.search && !row.insc.stagiaire.toLowerCase().includes(filters.search.toLowerCase())) return false;
    if (filters.week && String(row.semaine) !== filters.week) return false;
    if (filters.status === 'ok' && row.errors.length) return false;
    if (filters.status === 'error' && !row.errors.length) return false;
    return true;
  });

  const errCount = rows.filter((r) => r.errors.length).length;

  main.innerHTML = `
    <div class="page-header">
      <h1>Inscriptions</h1>
      <span class="sub">1 ligne = 1 stagiaire × 1 catégorie pratique (+ son test pratique) — ${rows.length} ligne(s), ${errCount ? `<b style="color:var(--error)">${errCount} anomalie(s)</b>` : 'aucune anomalie'}</span>
      <div class="page-actions">
        <button class="btn" id="btn-add">➕ Inscrire un stagiaire</button>
        <button class="btn btn-secondary" id="btn-csv">⬇ CSV</button>
      </div>
    </div>

    <div class="card no-print">
      <div class="form-row">
        <label class="field">Recherche stagiaire <input id="f-search" value="${esc(filters.search)}" placeholder="Nom…"></label>
        <label class="field">Semaine
          <select id="f-week">
            <option value="">Toutes</option>
            ${weeks.map((w) => `<option value="${w.week}" ${String(w.week) === filters.week ? 'selected' : ''}>S${w.week}</option>`).join('')}
          </select>
        </label>
        <label class="field">Statut
          <select id="f-status">
            <option value="">Tous</option>
            <option value="ok" ${filters.status === 'ok' ? 'selected' : ''}>✓ OK</option>
            <option value="error" ${filters.status === 'error' ? 'selected' : ''}>⚠ Anomalies</option>
          </select>
        </label>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th>N°</th><th>Stagiaire</th><th>Formation</th><th>Type</th><th>Durée</th>
              <th>Pratique</th><th>Théorie</th><th>Test pratique</th>
              <th>Formateur</th><th>Testeur</th><th>Reco</th><th>Sem.</th><th>Statut</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${visible.map((row) => rowHTML(state, row)).join('') || `<tr><td colspan="14" class="muted">Aucune inscription${rows.length ? ' ne correspond aux filtres' : ''}.</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>
  `;

  main.querySelector('#btn-add').addEventListener('click', () => openInscriptionForm());
  main.querySelector('#f-search').addEventListener('input', (e) => { filters.search = e.target.value; renderInscriptions(main); focusEnd(main, '#f-search'); });
  main.querySelector('#f-week').addEventListener('change', (e) => { filters.week = e.target.value; renderInscriptions(main); });
  main.querySelector('#f-status').addEventListener('change', (e) => { filters.status = e.target.value; renderInscriptions(main); });
  main.querySelector('#btn-csv').addEventListener('click', () => exportCSV(state, rows));

  main.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openInscriptionForm({ id: Number(b.dataset.edit) })));
  main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
    const id = Number(b.dataset.del);
    const insc = state.inscriptions.find((i) => i.id === id);
    if (confirm(`Supprimer l'inscription n°${id} (${insc?.stagiaire}) ?`)) {
      removeInscription(state, id);
      app.commit();
      toast(`Inscription n°${id} supprimée.`, 'ok');
    }
  }));
}

function focusEnd(main, sel) {
  const el = main.querySelector(sel);
  el.focus();
  el.setSelectionRange(el.value.length, el.value.length);
}

function rowHTML(state, row) {
  const { insc, formation } = row;
  const manuel = ' <span title="Choix manuel">✎</span>';
  const fmtF = row.formateurEffectif ? esc(memberName(state, row.formateurEffectif)) + (insc.formateurId ? manuel : '') : '<span class="badge badge-warn">—</span>';
  const fmtT = formation?.tests
    ? (row.testeurEffectif ? esc(memberName(state, row.testeurEffectif)) + (insc.testeurId ? manuel : '') : '<span class="badge badge-warn">—</span>')
    : '<span class="muted">n/a</span>';

  return `
    <tr class="${row.errors.length ? 'row-error' : ''}">
      <td>${insc.id}</td>
      <td><b>${esc(insc.stagiaire)}</b></td>
      <td>${esc(formation?.label || insc.formation || '?')}</td>
      <td>${esc(insc.type)}</td>
      <td>${fmtTime(row.duree).replace(':', 'h')}</td>
      <td>${insc.datePratique ? `${fmtDateShort(insc.datePratique)}<br>${fmtTime(insc.debutPratique)} → ${fmtTime(row.finPratique)}` : '<span class="muted">—</span>'}</td>
      <td>${insc.dateTheorie ? `${fmtDateShort(insc.dateTheorie)}<br>${fmtTime(row.heureTheorie)}` : '<span class="muted">—</span>'}</td>
      <td>${insc.dateTestPratique ? `${fmtDateShort(insc.dateTestPratique)}<br>${fmtTime(insc.debutTestPratique)} → ${fmtTime(row.finTestPratique)}` : '<span class="muted">—</span>'}</td>
      <td>${fmtF}</td>
      <td>${fmtT}</td>
      <td>${esc(formation?.reco || '')}</td>
      <td>${row.semaine ?? ''}</td>
      <td>${row.errors.length
        ? `<span class="badge badge-error">⚠ ${row.errors.length}</span><ul class="status-errors">${row.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`
        : '<span class="badge badge-ok">✓ OK</span>'}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-secondary btn-sm" data-edit="${insc.id}" title="Modifier">✏️</button>
        <button class="btn btn-danger btn-sm" data-del="${insc.id}" title="Supprimer">🗑</button>
      </td>
    </tr>
  `;
}

function exportCSV(state, rows) {
  const sep = ';';
  const header = ['N°', 'Stagiaire', 'Formation', 'Type', 'Durée pratique', 'Date pratique', 'Début pratique', 'Fin pratique',
    'Date théorie', 'Heure théorie', 'Date test pratique', 'Début test', 'Fin test',
    'Formateur effectif', 'Testeur effectif', 'Reco', 'Semaine', 'Statut'];
  const lines = rows.map((row) => {
    const i = row.insc;
    return [
      i.id, i.stagiaire, row.formation?.label || '', i.type, fmtTime(row.duree),
      fmtDateShort(i.datePratique), fmtTime(i.debutPratique), fmtTime(row.finPratique),
      fmtDateShort(i.dateTheorie), i.dateTheorie ? fmtTime(row.heureTheorie) : '',
      fmtDateShort(i.dateTestPratique), fmtTime(i.debutTestPratique), fmtTime(row.finTestPratique),
      memberName(state, row.formateurEffectif), memberName(state, row.testeurEffectif),
      row.formation?.reco || '', row.semaine ?? '',
      row.errors.length ? row.errors.join(' | ') : '✓ OK',
    ].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(sep);
  });
  const csv = '﻿' + [header.join(sep), ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'inscriptions-efi.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}
