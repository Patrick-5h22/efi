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
      <span class="sub">Montants saisis sur les inscriptions, rattachés au mois de la formation pratique — les inscriptions annulées sont exclues</span>
      <div class="page-actions">
        <select id="ca-annee">${annees.map((a) => `<option ${a === ca.annee ? 'selected' : ''}>${a}</option>`).join('')}</select>
        <button class="btn btn-secondary" id="btn-ca-csv">⬇ CSV</button>
        <button class="btn btn-secondary" onclick="window.print()">🖨 Imprimer</button>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="kpi-value">${fmtEuros(ca.total)}</div><div class="kpi-label">CA ${ca.annee}</div></div>
      <div class="kpi"><div class="kpi-value">${ca.dossiers}</div><div class="kpi-label">dossier(s) YPAREO</div></div>
      <div class="kpi"><div class="kpi-value">${ca.lignes}</div><div class="kpi-label">ligne(s) facturée(s)</div></div>
      <div class="kpi"><div class="kpi-value">${fmtEuros(moyenne)}</div><div class="kpi-label">CA moyen / dossier</div></div>
    </div>

    ${alertes(ca)}

    ${ca.mois.length ? ca.mois.map((m) => `
      <div class="card">
        <h2>${esc(m.label)}</h2>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Formation</th><th style="text-align:right">Chiffre d’affaires</th></tr></thead>
            <tbody>
              ${m.formations.map((f) => `<tr><td>${esc(f.label)}</td><td style="text-align:right" class="mono">${fmtEuros(f.total)}</td></tr>`).join('')}
              <tr class="ca-total"><td><b>Sous-total ${esc(m.label)}</b></td><td style="text-align:right" class="mono"><b>${fmtEuros(m.total)}</b></td></tr>
            </tbody>
          </table>
        </div>
      </div>`).join('') : `
      <div class="card"><p class="muted">Aucun montant saisi pour ${esc(ca.annee)}.
      Le chiffre d’affaires se renseigne sur chaque inscription, à côté du n° de dossier YPAREO.</p></div>`}

    ${ca.formations.length ? `
      <div class="card">
        <h2>Total par formation — ${esc(ca.annee)}</h2>
        <div class="table-wrap">
          <table class="data">
            <thead><tr><th>Formation</th><th style="text-align:right">Chiffre d’affaires</th><th style="text-align:right">Part</th></tr></thead>
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
  const items = [];
  if (ca.doublons.length) {
    items.push(`<b>${ca.doublons.length} montant(s) répété(s) sur un même dossier</b> —
      ${ca.doublons.slice(0, 4).map((d) => `${esc(d.dossier)} : ${fmtEuros(d.montant)} × ${d.lignes}`).join(', ')}${ca.doublons.length > 4 ? '…' : ''}.
      Un dossier couvrant plusieurs catégories occupe plusieurs lignes : si le montant total y est recopié,
      il est compté autant de fois. À répartir, ou à ne porter que sur une ligne.`);
  }
  if (ca.sansDate.count) {
    items.push(`<b>${ca.sansDate.count} ligne(s) facturée(s) sans date de pratique</b> (${fmtEuros(ca.sansDate.total)})
      — non rattachées à un mois, donc absentes des totaux ci-dessous.`);
  }
  if (ca.sansDossier) {
    items.push(`${ca.sansDossier} ligne(s) facturée(s) sans n° de dossier YPAREO.`);
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
  const lines = [['Mois', 'Formation', 'Chiffre d’affaires'].join(sep)];
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
