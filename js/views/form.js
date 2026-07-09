// Formulaire d'inscription (création / édition) — boîte de dialogue partagée
// entre la vue Inscriptions et les grilles de semaine.

import { app, esc, toast, render } from '../app.js';
import { addInscription, updateInscription } from '../store.js';
import { formationByCode, dureeFor, TYPES } from '../config.js';
import { daySlots, fmtTime, workingDays, fmtDateDay } from '../dates.js';
import { computeSchedule } from '../engine.js';

let dialog = null;

export function openInscriptionForm(options = {}) {
  // options : { id } pour édition, ou préremplissage { datePratique, debutPratique, ... }
  const state = app.state;
  const editing = options.id != null ? state.inscriptions.find((i) => i.id === options.id) : null;
  const init = editing || {
    stagiaire: options.stagiaire || '',
    formation: options.formation || '',
    type: options.type || 'Initial',
    datePratique: options.datePratique || null,
    debutPratique: options.debutPratique ?? null,
    dateTheorie: options.dateTheorie || null,
    dateTestPratique: options.dateTestPratique || null,
    debutTestPratique: options.debutTestPratique ?? null,
    formateurId: null,
    testeurId: null,
  };

  if (dialog) dialog.remove();
  dialog = document.createElement('dialog');

  const slots = daySlots(state.params);
  const openSet = new Set(state.openDays);
  const days = workingDays(state.params);

  const dayOptions = (selected) => days.map((d) =>
    `<option value="${d}" ${d === selected ? 'selected' : ''}>${fmtDateDay(d)}${openSet.has(d) ? '' : ' (fermé)'}</option>`
  ).join('');

  const timeOptions = (selected) => slots.map((t) =>
    `<option value="${t}" ${t === selected ? 'selected' : ''}>${fmtTime(t)}</option>`
  ).join('');

  const memberOptions = (selected) => state.team
    .filter((m) => m.name.trim())
    .map((m) => `<option value="${m.id}" ${m.id === selected ? 'selected' : ''}>${esc(m.name)}</option>`)
    .join('');

  dialog.innerHTML = `
    <form method="dialog" id="insc-form">
      <div class="dialog-header">
        <h2>${editing ? 'Modifier l’inscription n°' + editing.id : 'Inscrire un stagiaire'}</h2>
        <button type="button" class="dialog-close" aria-label="Fermer">✕</button>
      </div>
      <div class="dialog-body">
        <div class="form-grid">
          <label class="field" style="grid-column: span 2;">Stagiaire (NOM Prénom)
            <input name="stagiaire" required value="${esc(init.stagiaire)}" list="stagiaire-list" placeholder="DUPONT Jean">
            <datalist id="stagiaire-list">
              ${[...new Set(state.inscriptions.map((i) => i.stagiaire))].map((s) => `<option value="${esc(s)}">`).join('')}
            </datalist>
          </label>
          <label class="field">Formation
            <select name="formation" required>
              <option value="">— choisir —</option>
              ${state.formations.map((f) => `<option value="${f.code}" ${f.code === init.formation ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}
            </select>
          </label>
          <label class="field">Type
            <select name="type">${TYPES.map((t) => `<option ${t === init.type ? 'selected' : ''}>${t}</option>`).join('')}</select>
          </label>
        </div>
        <p class="muted" id="duree-info"></p>

        <h2 style="font-size:14px; margin: 14px 0 8px;">Formation pratique</h2>
        <div class="form-grid">
          <label class="field">Date <select name="datePratique" required><option value="">—</option>${dayOptions(init.datePratique)}</select></label>
          <label class="field">Heure de début <select name="debutPratique" required><option value="">—</option>${timeOptions(init.debutPratique)}</select></label>
          <label class="field">Fin (auto) <input name="finPratique" disabled></label>
        </div>

        <div id="tests-section">
          <h2 style="font-size:14px; margin: 14px 0 8px;">Tests (obligatoires R489 / R486)</h2>
          <div class="form-grid">
            <label class="field">Date test pratique <select name="dateTestPratique"><option value="">—</option>${dayOptions(init.dateTestPratique)}</select></label>
            <label class="field">Début test pratique <select name="debutTestPratique"><option value="">—</option>${timeOptions(init.debutTestPratique)}</select></label>
            <label class="field">Date test théorique <select name="dateTheorie"><option value="">—</option>${dayOptions(init.dateTheorie)}</select></label>
          </div>
          <p class="muted">Le test théorique a lieu à ${fmtTime(state.params.theoryTime)} (créneau commun du jour). La théorie d'une
          recommandation est commune à toutes ses catégories : un seul créneau par stagiaire et par recommandation.</p>
        </div>

        <h2 style="font-size:14px; margin: 14px 0 8px;">Intervenants <span class="muted">(vide = affectation automatique)</span></h2>
        <div class="form-grid">
          <label class="field">Formateur (si ≠ jour) <select name="formateurId"><option value="">— auto —</option>${memberOptions(init.formateurId)}</select></label>
          <label class="field">Testeur (si ≠ jour) <select name="testeurId"><option value="">— auto —</option>${memberOptions(init.testeurId)}</select></label>
        </div>

        <div id="form-preview" style="margin-top: 12px;"></div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn btn-secondary" id="btn-cancel">Annuler</button>
        <button type="submit" class="btn" id="btn-save">${editing ? 'Enregistrer' : 'Inscrire'}</button>
      </div>
    </form>
  `;
  document.body.appendChild(dialog);

  const form = dialog.querySelector('#insc-form');
  const $ = (name) => form.elements[name];

  const readDraft = () => ({
    stagiaire: $('stagiaire').value.trim(),
    formation: $('formation').value || null,
    type: $('type').value,
    datePratique: $('datePratique').value || null,
    debutPratique: $('debutPratique').value ? Number($('debutPratique').value) : null,
    dateTheorie: $('dateTheorie').value || null,
    dateTestPratique: $('dateTestPratique').value || null,
    debutTestPratique: $('debutTestPratique').value ? Number($('debutTestPratique').value) : null,
    formateurId: $('formateurId').value || null,
    testeurId: $('testeurId').value || null,
  });

  // Aperçu en direct : durée, fin, contrôles
  const refresh = () => {
    const draft = readDraft();
    const formation = formationByCode(state.formations, draft.formation);
    const duree = dureeFor(formation, draft.type);
    $('finPratique').value = draft.debutPratique != null && formation ? fmtTime(draft.debutPratique + duree) : '';
    dialog.querySelector('#duree-info').textContent = formation
      ? `Durée de la pratique : ${fmtTime(duree).replace(':', 'h')}${formation.tests ? ` — tests obligatoires (${formation.reco})` : ' — pas de test planifié dans cet outil'}${formation.capacite > 1 ? ` — capacité simultanée : ${formation.capacite}` : ''}`
      : '';
    dialog.querySelector('#tests-section').style.display = formation && !formation.tests ? 'none' : '';

    // Simulation des contrôles sur une copie de l'état
    const preview = dialog.querySelector('#form-preview');
    if (!draft.formation || !draft.datePratique || draft.debutPratique == null) { preview.innerHTML = ''; return; }
    const sim = structuredClone(state);
    if (editing) {
      Object.assign(sim.inscriptions.find((i) => i.id === editing.id), draft);
    } else {
      sim.inscriptions.push({ id: sim.nextId++, ...draft });
    }
    const { rows } = computeSchedule(sim);
    const simRow = rows.find((r) => r.insc.id === (editing ? editing.id : sim.nextId - 1));
    if (simRow.errors.length) {
      preview.innerHTML = `<div class="badge badge-error">⚠ ${simRow.errors.length} anomalie(s)</div>
        <ul class="status-errors">${simRow.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>
        <p class="muted">Vous pouvez enregistrer malgré tout : l'anomalie restera signalée dans la colonne STATUT.</p>`;
    } else {
      preview.innerHTML = `<div class="badge badge-ok">✓ OK — aucun conflit détecté</div>`;
    }
  };
  form.addEventListener('input', refresh);
  refresh();

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const draft = readDraft();
    if (!draft.stagiaire || !draft.formation || !draft.datePratique || draft.debutPratique == null) {
      toast('Champs obligatoires : stagiaire, formation, date et heure de pratique.', 'error');
      return;
    }
    if (editing) {
      updateInscription(state, editing.id, draft);
      toast(`Inscription n°${editing.id} mise à jour.`, 'ok');
    } else {
      const insc = addInscription(state, draft);
      toast(`${draft.stagiaire} inscrit (n°${insc.id}).`, 'ok');
    }
    app.commit();
    dialog.close();
    dialog.remove();
    dialog = null;
  });

  const close = () => { dialog.close(); dialog.remove(); dialog = null; };
  dialog.querySelector('.dialog-close').addEventListener('click', close);
  dialog.querySelector('#btn-cancel').addEventListener('click', close);
  dialog.addEventListener('cancel', () => { dialog.remove(); dialog = null; });

  dialog.showModal();
}
