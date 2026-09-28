// Suivi du chiffre d’affaires — équivalent de l'onglet « Chiffre d’affaires »
// du classeur : un bloc par mois avec une ligne par formation et un
// sous-total, puis le total par formation sur l'année et le total général.

import { app, esc, navigate } from '../app.js';
import { caSummary, anneesDisponibles, fmtEuros } from '../ca.js';

let annee = null;

export function renderCA(main, args) {
  const state = app.state;
  const annees = anneesDisponibles(state);
  annee = args?.[0] || annee || annees[0] || String(new Date().getFullYear());
  const ca = caSummary(state, annee);

  const moyenne = ca.dossiers ? ca.total / ca.dossiers : 0;

  main.innerHTML = `
    <div class="page-header">
      <h1>Chiffre d’affaires</h1>
      <span class="sub">Un montant par <b>parcours</b> — la vente, non la séance —, rattaché au mois de sa première pratique. Les parcours entièrement annulés sont exclus.</span>
      <div class="page-actions">
        <select id="ca-annee">${annees.map((a) => `<option ${a === ca.annee ? 'selected' : ''}>${a}</option>`).join('')}</select>
        <button class="btn btn-secondary" id="btn-ca-csv">⬇ CSV</button>
        <button class="btn btn-secondary" onclick="window.print()">🖨 Imprimer</button>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="kpi-value">${fmtEuros(ca.total)}</div><div class="kpi-label">CA ${ca.annee}</div></div>
      <div class="kpi"><div class="kpi-value">${ca.dossiers}</div><div class="kpi-label">dossier(s) YPAREO</div></div>
      <div class="kpi"><div class="kpi-value">${ca.lignes}</div><div class="kpi-label">parcours facturé(s)</div></div>
      <div class="kpi"><div class="kpi-value">${ca.seances}</div><div class="kpi-label">séance(s) couverte(s)</div></div>
      <div class="kpi"><div class="kpi-value">${fmtEuros(moyenne)}</div><div class="kpi-label">CA moyen / dossier</div></div>
    </div>

    ${alertes(ca)}

    ${ca.mois.length ? ca.mois.map((m) => `
      <div class="card">
        <h2>${esc(m.label)}</h2>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Recommandation</th><th style="text-align:right">Chiffre d’affaires</th></tr></thead>
            <tbody>
              ${m.formations.map((f) => `<tr><td>${esc(f.label)}</td><td style="text-align:right" class="mono">${fmtEuros(f.total)}</td></tr>`).join('')}
              <tr class="ca-total"><td><b>Sous-total ${esc(m.label)}</b></td><td style="text-align:right" class="mono"><b>${fmtEuros(m.total)}</b></td></tr>
            </tbody>
          </table>
        </div>
      </div>`).join('') : `
      <div class="card"><p class="muted">Aucun montant saisi pour ${esc(ca.annee)}.
      Le chiffre d’affaires se renseigne <b>une fois par parcours</b>, dans le formulaire d’inscription, à côté du n° de dossier YPAREO.</p></div>`}

    ${ca.formations.length ? `
      <div class="card">
        <h2>Total par recommandation — ${esc(ca.annee)}</h2>
        <p class="muted">Un parcours se vend par recommandation. Le ventiler entre ses catégories
        — « R489 Cat 1A + 3 + 5 » à 900 € — demanderait une règle de répartition que personne n’a donnée.</p>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Recommandation</th><th style="text-align:right">Chiffre d’affaires</th><th style="text-align:right">Part</th></tr></thead>
            <tbody>
              ${ca.formations.map((f) => `<tr>
                <td>${esc(f.label)}</td>
                <td style="text-align:right" class="mono">${fmtEuros(f.total)}</td>
                <td style="text-align:right" class="mono">${ca.total ? Math.round((f.total / ca.total) * 100) : 0} %</td>
              </tr>`).join('')}
              <tr class="ca-total"><td><b>TOTAL ${esc(ca.annee)}</b></td><td style="text-align:right" class="mono"><b>${fmtEuros(ca.total)}</b></td><td></td></tr>
            </tbody>
          </table>
        </div>
      </div>` : ''}
  `;

  main.querySelector('#ca-annee').addEventListener('change', (e) => navigate(`ca/${e.target.value}`));
  main.querySelector('#btn-ca-csv').addEventListener('click', () => exportCA(ca));
  main.querySelectorAll('[data-goto-insc]').forEach((b) => b.addEventListener('click', () => navigate('inscriptions')));
}

// Points de vigilance sur la saisie — informatifs, jamais bloquants.
function alertes(ca) {
  // Le contrôle « même montant répété sur un même dossier » a disparu avec sa
  // cause : le montant ne s'écrit plus qu'à un seul endroit, le parcours.
  const items = [];
  if (ca.sansDate.count) {
    items.push(`<b>${ca.sansDate.count} parcours facturé(s) sans date de pratique</b> (${fmtEuros(ca.sansDate.total)})
      — non rattachés à un mois, donc absents des totaux ci-dessous.`);
  }
  if (ca.sansDossier) {
    items.push(`${ca.sansDossier} parcours facturé(s) sans n° de dossier YPAREO.`);
  }
  if (!items.length) return '';
  return `<div class="card" style="border-left:3px solid var(--warn)">
    <h2>⚠ Points de vigilance</h2>
    <ul class="plain-list">${items.map((t) => `<li>${t}</li>`).join('')}</ul>
    <p class="muted"><button class="btn btn-secondary btn-sm" data-goto-insc>Ouvrir les inscriptions</button></p>
  </div>`;
}

function exportCA(ca) {
  const sep = ';';
  const lines = [['Mois', 'Recommandation', 'Chiffre d’affaires'].join(sep)];
  for (const m of ca.mois) {
    for (const f of m.formations) lines.push([m.label, f.label, f.total].map(csvCell).join(sep));
    lines.push([m.label, 'Sous-total', m.total].map(csvCell).join(sep));
  }
  lines.push('');
  for (const f of ca.formations) lines.push([`Total ${ca.annee}`, f.label, f.total].map(csvCell).join(sep));
  lines.push([`TOTAL ${ca.annee}`, '', ca.total].map(csvCell).join(sep));

  const csv = '﻿' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chiffre-affaires-${ca.annee}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function csvCell(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}
