// Vue Stagiaires : regroupe les inscriptions par stagiaire pour suivre
// son parcours complet (catégories, tests, théorie, anomalies).

import { app, esc } from '../app.js';
import { memberName } from '../store.js';
import { fmtTime, fmtDateShort } from '../dates.js';
import { openInscriptionForm } from './form.js';

let search = '';

export function renderStagiaires(main) {
  const state = app.state;
  const { rows } = app.schedule;

  // Regroupement par stagiaire (insensible à la casse)
  const groups = new Map();
  for (const row of rows) {
    const key = row.insc.stagiaire.toLowerCase();
    if (!groups.has(key)) groups.set(key, { name: row.insc.stagiaire, rows: [] });
    groups.get(key).rows.push(row);
  }
  let list = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  if (search) list = list.filter((g) => g.name.toLowerCase().includes(search.toLowerCase()));

  main.innerHTML = `
    <div class="page-header">
      <h1>Stagiaires</h1>
      <span class="sub">${groups.size} stagiaire(s) — parcours complet par personne</span>
      <div class="page-actions">
        <button class="btn" id="btn-add">➕ Inscrire un stagiaire</button>
      </div>
    </div>

    <div class="card no-print">
      <label class="field" style="max-width:280px">Recherche <input id="s-search" value="${esc(search)}" placeholder="Nom…"></label>
    </div>

    ${list.map((g) => groupCard(state, g)).join('') || '<div class="card"><p class="muted">Aucun stagiaire.</p></div>'}
  `;

  main.querySelector('#btn-add').addEventListener('click', () => openInscriptionForm());
  main.querySelector('#s-search').addEventListener('input', (e) => {
    search = e.target.value;
    renderStagiaires(main);
    const el = main.querySelector('#s-search');
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  });
  main.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => openInscriptionForm({ id: Number(b.dataset.edit) })));
  main.querySelectorAll('[data-addcat]').forEach((b) => b.addEventListener('click', () => {
    openInscriptionForm({ stagiaire: b.dataset.addcat });
  }));
}

function groupCard(state, g) {
  const errCount = g.rows.reduce((n, r) => n + r.errors.length, 0);
  const recos = [...new Set(g.rows.map((r) => r.formation?.reco).filter(Boolean))];

  // Parcours chronologique
  const steps = [];
  for (const r of g.rows) {
    const i = r.insc;
    if (i.datePratique) steps.push({ date: i.datePratique, start: i.debutPratique ?? 0, label: `Formation ${short(r)}`, time: `${fmtTime(i.debutPratique)} → ${fmtTime(r.finPratique)}`, who: memberName(state, r.formateurEffectif), id: i.id, err: r.errors.length });
    if (i.dateTheorie) steps.push({ date: i.dateTheorie, start: state.params.theoryTime, label: `Test théorique ${r.formation?.reco || ''}`, time: `${fmtTime(state.params.theoryTime)} → ${fmtTime(state.params.theoryTime + state.params.theoryDuration)}`, who: memberName(state, r.testeurTheorie), id: i.id, err: 0 });
    if (i.dateTestPratique && r.formation?.tests) steps.push({ date: i.dateTestPratique, start: i.debutTestPratique ?? 0, label: `Test pratique ${short(r)}`, time: `${fmtTime(i.debutTestPratique)} → ${fmtTime(r.finTestPratique)}`, who: memberName(state, r.testeurEffectif), id: i.id, err: 0 });
  }
  steps.sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start);

  return `
    <div class="card">
      <div style="display:flex; align-items:center; gap:10px; flex-wrap:wrap">
        <h2 style="margin:0">${esc(g.name)}</h2>
        ${recos.map((r) => `<span class="badge badge-info">${esc(r)}</span>`).join('')}
        ${errCount ? `<span class="badge badge-error">⚠ ${errCount} anomalie(s)</span>` : '<span class="badge badge-ok">✓ OK</span>'}
        <span class="muted">${g.rows.length} catégorie(s)</span>
        <button class="btn btn-secondary btn-sm" style="margin-left:auto" data-addcat="${esc(g.name)}">➕ Autre catégorie</button>
      </div>
      <div class="table-wrap" style="margin-top:10px">
        <table class="data">
          <thead><tr><th>Date</th><th>Horaire</th><th>Étape</th><th>Intervenant</th><th></th></tr></thead>
          <tbody>
            ${steps.map((s) => `
              <tr class="${s.err ? 'row-error' : ''}">
                <td>${fmtDateShort(s.date)}</td>
                <td>${s.time}</td>
                <td>${esc(s.label)}</td>
                <td>${esc(s.who || '—')}</td>
                <td><button class="btn btn-secondary btn-sm" data-edit="${s.id}" title="Modifier la ligne">✏️</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function short(r) {
  return r.formation ? r.formation.label.replace('Pratique ', '') : '?';
}
