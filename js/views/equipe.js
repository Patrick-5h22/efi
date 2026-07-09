// Équipe : intervenants (12 max) et habilitations F/T par spécialité
// (équivalent de l'onglet « Équipe »).

import { app, esc, toast } from '../app.js';
import { MAX_TEAM } from '../config.js';

export function renderEquipe(main) {
  const state = app.state;

  main.innerHTML = `
    <div class="page-header">
      <h1>Équipe — intervenants et habilitations</h1>
      <span class="sub">F = habilité à FORMER, T = habilité à TESTER. Ces habilitations alimentent l'affectation automatique et les contrôles.</span>
      <div class="page-actions">
        <button class="btn" id="btn-add" ${state.team.length >= MAX_TEAM ? 'disabled' : ''}>➕ Ajouter un intervenant</button>
      </div>
    </div>

    <div class="card">
      <div class="table-wrap">
        <table class="data">
          <thead>
            <tr>
              <th rowspan="2">Intervenant (NOM Prénom)</th>
              ${state.formations.map((f) => `<th colspan="2" style="text-align:center">${esc(f.code)}</th>`).join('')}
              <th rowspan="2"></th>
            </tr>
            <tr>${state.formations.map(() => '<th style="text-align:center">F</th><th style="text-align:center">T</th>').join('')}</tr>
          </thead>
          <tbody>
            ${state.team.map((m) => `
              <tr>
                <td><input data-name="${m.id}" value="${esc(m.name)}" style="min-width:180px"></td>
                ${state.formations.map((f) => {
                  const q = m.quals?.[f.code] || {};
                  return `
                    <td style="text-align:center"><input type="checkbox" data-qual="${m.id}|${f.code}|F" ${q.F ? 'checked' : ''} aria-label="${esc(m.name)} forme ${f.code}"></td>
                    <td style="text-align:center"><input type="checkbox" data-qual="${m.id}|${f.code}|T" ${q.T ? 'checked' : ''} aria-label="${esc(m.name)} teste ${f.code}"></td>`;
                }).join('')}
                <td><button class="btn btn-danger btn-sm" data-del="${m.id}" title="Supprimer">🗑</button></td>
              </tr>`).join('')}
            ${!state.team.length ? `<tr><td colspan="${2 + state.formations.length * 2}" class="muted">Aucun intervenant — ajoutez-en pour permettre les affectations.</td></tr>` : ''}
          </tbody>
        </table>
      </div>
      <p class="muted">Un intervenant affecté à un candidat hors de ses habilitations est signalé dans le STATUT des inscriptions
      (« Formateur/Testeur non habilité »). Maximum ${MAX_TEAM} intervenants.</p>
    </div>
  `;

  main.querySelector('#btn-add')?.addEventListener('click', () => {
    const id = 'p' + (Math.max(0, ...state.team.map((m) => Number(m.id.replace(/\D/g, '')) || 0)) + 1);
    state.team.push({ id, name: '', quals: {} });
    app.commit();
  });

  main.querySelectorAll('[data-name]').forEach((input) => {
    input.addEventListener('change', () => {
      const m = state.team.find((t) => t.id === input.dataset.name);
      m.name = input.value.trim();
      app.commit();
    });
  });

  main.querySelectorAll('[data-qual]').forEach((cb) => {
    cb.addEventListener('change', () => {
      const [id, code, kind] = cb.dataset.qual.split('|');
      const m = state.team.find((t) => t.id === id);
      m.quals = m.quals || {};
      m.quals[code] = m.quals[code] || {};
      m.quals[code][kind] = cb.checked;
      app.commit();
    });
  });

  main.querySelectorAll('[data-del]').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.dataset.del;
      const m = state.team.find((t) => t.id === id);
      const used = state.inscriptions.some((i) => i.formateurId === id || i.testeurId === id)
        || Object.values(state.dayAssignments).some((a) => a.formateur === id || a.testeur === id);
      if (used && !confirm(`${m.name || 'Cet intervenant'} est affecté à des inscriptions ou des jours. Supprimer quand même ?`)) return;
      state.team = state.team.filter((t) => t.id !== id);
      // Nettoyage des références
      for (const i of state.inscriptions) {
        if (i.formateurId === id) i.formateurId = null;
        if (i.testeurId === id) i.testeurId = null;
      }
      for (const a of Object.values(state.dayAssignments)) {
        if (a.formateur === id) a.formateur = null;
        if (a.testeur === id) a.testeur = null;
      }
      app.commit();
      toast('Intervenant supprimé (références remises en affectation automatique).', 'ok');
    });
  });
}
