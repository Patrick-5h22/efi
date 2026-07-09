// Paramètres : formations/durées/capacités, horaires, tests, charge
// (équivalent de l'onglet « Paramètres »).

import { app, esc, toast } from '../app.js';
import { fmtTime, parseTime } from '../dates.js';
import { defaultState, seedExamples, saveState } from '../store.js';

export function renderParametres(main) {
  const state = app.state;
  const p = state.params;

  main.innerHTML = `
    <div class="page-header">
      <h1>Paramètres</h1>
      <span class="sub">Formations, horaires et règles de charge — appliqués immédiatement à tous les contrôles</span>
    </div>

    <div class="card">
      <h2>1. Formations, durées (heures) et capacités</h2>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Code</th><th>Formation</th><th>Recommandation</th><th>Durée Initial (h)</th><th>Durée Recyclage (h)</th><th>Tests obligatoires</th><th>Capacité simultanée</th></tr></thead>
          <tbody>
            ${state.formations.map((f, idx) => `
              <tr>
                <td><b>${esc(f.code)}</b></td>
                <td>${esc(f.label)}</td>
                <td>${esc(f.reco)}</td>
                <td><input type="number" step="0.5" min="0.5" max="8" value="${f.dureeInitial / 60}" data-f="${idx}|dureeInitial" style="width:70px"></td>
                <td><input type="number" step="0.5" min="0.5" max="8" value="${f.dureeRecyclage / 60}" data-f="${idx}|dureeRecyclage" style="width:70px"></td>
                <td style="text-align:center"><input type="checkbox" ${f.tests ? 'checked' : ''} data-f="${idx}|tests"></td>
                <td><input type="number" min="1" max="4" value="${f.capacite}" data-f="${idx}|capacite" style="width:60px"></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="muted">La capacité simultanée > 1 (ex. R489 Cat 3 : 2 chariots) autorise plusieurs candidats en même temps avec le même formateur, sur la même catégorie uniquement.</p>
    </div>

    <div class="card">
      <h2>2. Horaires, tests et charge</h2>
      <div class="form-grid">
        <label class="field">Heure de début de journée <input value="${fmtTime(p.dayStart)}" data-p="dayStart" data-time></label>
        <label class="field">Heure de fin de journée <input value="${fmtTime(p.dayEnd)}" data-p="dayEnd" data-time></label>
        <label class="field">Heure du test théorique (créneau unique) <input value="${fmtTime(p.theoryTime)}" data-p="theoryTime" data-time></label>
        <label class="field">Durée du test théorique (h) <input type="number" step="0.5" min="0.5" max="4" value="${p.theoryDuration / 60}" data-p="theoryDuration" data-hours></label>
        <label class="field">Durée du test pratique (h) <input type="number" step="0.5" min="0.5" max="4" value="${p.practicalTestDuration / 60}" data-p="practicalTestDuration" data-hours></label>
        <label class="field">Charge max de formation pratique / jour (h) <input type="number" step="0.5" min="1" max="9" value="${p.maxDailyLoad / 60}" data-p="maxDailyLoad" data-hours></label>
      </div>
    </div>

    <div class="card">
      <h2>3. Période et jours fériés</h2>
      <p>Période : <b>${esc(p.periodStart)}</b> → <b>${esc(p.periodEnd)}</b> (week-ends exclus).</p>
      <p>Jours fériés exclus : ${(p.holidays || []).map((h) => `<span class="badge badge-info">${esc(h.date || h)}${h.label ? ' — ' + esc(h.label) : ''}</span>`).join(' ')}</p>
      <p class="muted">Le calendrier d'ouverture du plateau se gère dans l'onglet « Jours EFI ».</p>
    </div>

    <div class="card">
      <h2>Données</h2>
      <div class="form-row">
        <button class="btn btn-secondary" id="btn-seed">Recharger les 4 exemples du classeur</button>
        <button class="btn btn-danger" id="btn-reset">Réinitialiser toutes les données</button>
      </div>
      <p class="muted">⚠ Les lignes d'exemple sont à supprimer avant utilisation réelle (comme dans le classeur).
      L'export JSON (barre latérale) permet de sauvegarder avant toute manipulation.</p>
    </div>
  `;

  main.querySelectorAll('[data-f]').forEach((input) => {
    input.addEventListener('change', () => {
      const [idx, field] = input.dataset.f.split('|');
      const f = state.formations[Number(idx)];
      if (field === 'tests') f.tests = input.checked;
      else if (field === 'capacite') f.capacite = Math.max(1, Number(input.value) || 1);
      else f[field] = Math.round((Number(input.value) || 1) * 60);
      app.commit();
      toast('Paramètre enregistré.', 'ok');
    });
  });

  main.querySelectorAll('[data-p]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.p;
      if ('time' in input.dataset) {
        const v = parseTime(input.value);
        if (v == null) { toast('Heure invalide (format HH:MM).', 'error'); input.value = fmtTime(state.params[key]); return; }
        state.params[key] = v;
      } else {
        state.params[key] = Math.round((Number(input.value) || 1) * 60);
      }
      app.commit();
      toast('Paramètre enregistré.', 'ok');
    });
  });

  main.querySelector('#btn-seed').addEventListener('click', () => {
    seedExamples(state);
    app.commit();
    toast('Exemples du classeur ajoutés.', 'ok');
  });

  main.querySelector('#btn-reset').addEventListener('click', () => {
    if (!confirm('Réinitialiser TOUTES les données (inscriptions, équipe, jours, paramètres) ?')) return;
    app.state = seedExamples(defaultState());
    saveState(localStorage, app.state);
    app.commit();
    toast('Données réinitialisées.', 'ok');
  });
}
