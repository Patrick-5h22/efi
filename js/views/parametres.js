// Paramètres : formations/durées/capacités, horaires, tests, charge
// (équivalent de l'onglet « Paramètres »).

import { app, esc, toast } from '../app.js';
import { fmtTime, parseTime, fmtDateShort } from '../dates.js';
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
                <td style="text-align:center">${f.testOnly
                  ? '<span class="muted" title="Épreuve surveillée : la formation se fait à distance, seule l’épreuve est planifiée — pas de tests séparés">épreuve seule</span>'
                  : `<input type="checkbox" ${f.tests ? 'checked' : ''} data-f="${idx}|tests">`}</td>
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
        <label class="field">Capacité de la salle de théorie (places) <input type="number" min="1" max="40" value="${p.salleCapacite ?? 12}" data-p="salleCapacite" data-int></label>
      </div>
    </div>

    <div class="card">
      <h2>3. Période et jours fériés</h2>
      <div class="form-row">
        <label class="field">Début de période <input type="date" value="${esc(p.periodStart)}" data-p-date="periodStart"></label>
        <label class="field">Fin de période <input type="date" value="${esc(p.periodEnd)}" data-p-date="periodEnd"></label>
      </div>
      <p style="margin-bottom:6px">Jours fériés exclus :</p>
      <div class="form-row">
        ${(p.holidays || []).map((h, i) => `<span class="badge badge-info">${fmtDateShort(h.date || h)}${h.label ? ' — ' + esc(h.label) : ''} <button class="btn btn-sm btn-secondary" data-del-holiday="${i}" title="Retirer" style="padding:0 6px">✕</button></span>`).join(' ')}
        <input type="date" id="new-holiday-date" title="Date du férié">
        <input id="new-holiday-label" placeholder="Libellé (ex. Pâques)" style="max-width:150px">
        <button class="btn btn-secondary btn-sm" id="btn-add-holiday">➕ Ajouter un férié</button>
      </div>
      <p class="muted">Les week-ends sont toujours exclus. Le calendrier d'ouverture du plateau se gère dans l'onglet « Jours EFI ».
      Modifier la période régénère les semaines affichées (les inscriptions existantes sont conservées).</p>
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
      } else if ('int' in input.dataset) {
        state.params[key] = Math.max(1, Math.round(Number(input.value) || 1));
      } else {
        state.params[key] = Math.round((Number(input.value) || 1) * 60);
      }
      app.commit();
      toast('Paramètre enregistré.', 'ok');
    });
  });

  main.querySelectorAll('[data-p-date]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.pDate;
      if (!input.value) return;
      const next = { ...state.params, [key]: input.value };
      if (next.periodStart >= next.periodEnd) { toast('La fin de période doit suivre le début.', 'error'); input.value = state.params[key]; return; }
      state.params[key] = input.value;
      app.commit();
      toast('Période mise à jour.', 'ok');
    });
  });

  main.querySelectorAll('[data-del-holiday]').forEach((b) => {
    b.addEventListener('click', () => {
      state.params.holidays.splice(Number(b.dataset.delHoliday), 1);
      app.commit();
    });
  });

  main.querySelector('#btn-add-holiday').addEventListener('click', () => {
    const date = main.querySelector('#new-holiday-date').value;
    const label = main.querySelector('#new-holiday-label').value.trim();
    if (!date) { toast('Choisissez une date de férié.', 'error'); return; }
    state.params.holidays = state.params.holidays || [];
    if (state.params.holidays.some((h) => (h.date || h) === date)) { toast('Ce férié existe déjà.', 'error'); return; }
    state.params.holidays.push({ date, label });
    state.params.holidays.sort((a, b) => (a.date || a).localeCompare(b.date || b));
    app.commit();
    toast('Férié ajouté.', 'ok');
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
