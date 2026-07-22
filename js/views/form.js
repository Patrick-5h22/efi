// Formulaire d'inscription (création / édition) — boîte de dialogue partagée
// entre la vue Inscriptions et les grilles de semaine.

import { app, esc, toast } from '../app.js';
import { addInscription, updateInscription } from '../store.js';
import { formationByCode, dureeFor, TYPES, MODES_THEORIE, THEORIE_CENTRE_DUREE_DEFAUT, dureeTheorieFor } from '../config.js';
import { daySlots, fmtTime, workingDays, fmtDateDay } from '../dates.js';
import { computeSchedule, memberAvailability, suggestSlots, availableSlotsFor, availableTheorieSlots, roomFreeSlots } from '../engine.js';

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
    modeTheorie: options.modeTheorie || 'distance',
    dateTheorieFormation: options.dateTheorieFormation || null,
    debutTheorieFormation: options.debutTheorieFormation ?? null,
    dureeTheorieCentre: null,
    formateurTheorieId: null,
    entreprise: options.entreprise || '',
    siret: options.siret || '',
    statut: options.statut || 'confirmee',
    motifAnnulation: '',
  };

  if (dialog) dialog.remove();
  dialog = document.createElement('dialog');

  const slots = daySlots(state.params);
  const openSet = new Set(state.openDays);
  const days = workingDays(state.params);
  // Mode guidé (défaut) : seuls les jours ouverts et les créneaux avec une
  // ressource disponible sont proposés. « Saisie libre » réaffiche tout.
  let expert = false;

  const dayOptions = (selected) => days
    .filter((d) => expert || openSet.has(d) || d === selected)
    .map((d) =>
      `<option value="${d}" ${d === selected ? 'selected' : ''}>${fmtDateDay(d)}${openSet.has(d) ? '' : ' (fermé)'}</option>`
    ).join('');

  const timeOptions = (selected) => slots.map((t) =>
    `<option value="${t}" ${t === selected ? 'selected' : ''}>${fmtTime(t)}</option>`
  ).join('');

  // Options d'heures filtrées sur les créneaux disponibles (mode guidé) ;
  // la valeur déjà saisie reste proposée, marquée « indisponible ».
  const guidedTimeOptions = (available, selected) => {
    const set = new Set(available);
    return slots
      .filter((t) => expert || set.has(t) || t === selected)
      .map((t) => {
        const suffix = set.has(t) ? '' : (expert ? ' ⚠' : ' (indisponible)');
        return `<option value="${t}" ${t === selected ? 'selected' : ''}>${fmtTime(t)}${suffix}</option>`;
      })
      .join('');
  };

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
        <div class="form-grid" style="margin-top:10px">
          <label class="field">Entreprise <input name="entreprise" value="${esc(init.entreprise || '')}" placeholder="(facultatif)"></label>
          <label class="field">SIRET <input name="siret" value="${esc(init.siret || '')}" placeholder="(facultatif)" maxlength="14"></label>
          <label class="field">Statut du dossier
            <select name="statut">
              <option value="pre" ${init.statut === 'pre' ? 'selected' : ''}>🕐 Pré-réservée</option>
              <option value="confirmee" ${(init.statut || 'confirmee') === 'confirmee' ? 'selected' : ''}>✓ Confirmée</option>
              <option value="annulee" ${init.statut === 'annulee' ? 'selected' : ''}>✕ Annulée</option>
            </select>
          </label>
          <label class="field" id="motif-field" style="display:${init.statut === 'annulee' ? '' : 'none'}">Motif d'annulation
            <input name="motifAnnulation" value="${esc(init.motifAnnulation || '')}" placeholder="Report client…"></label>
        </div>
        <p class="muted" id="duree-info"></p>
        <div class="form-row no-print">
          <button type="button" class="btn btn-secondary btn-sm" id="btn-suggest" title="Chercher la première combinaison pratique + tests sans conflit">💡 Proposer des créneaux</button>
          <label class="expert-toggle" title="Par défaut, seuls les jours ouverts et les créneaux avec un intervenant habilité, présent et libre sont proposés. La saisie libre réaffiche tout (les contrôles restent actifs).">
            <input type="checkbox" id="expert-toggle"> Saisie libre
          </label>
          <span class="muted" id="suggest-info"></span>
        </div>

        <h2 style="font-size:14px; margin: 14px 0 8px;" id="pratique-title">Formation pratique</h2>
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

        <div id="theorie-formation-section">
          <h2 style="font-size:14px; margin: 14px 0 8px;">Théorie de la formation</h2>
          <div class="form-grid">
            <label class="field">Mode
              <select name="modeTheorie">
                ${MODES_THEORIE.map((m) => `<option value="${m.id}" ${m.id === (init.modeTheorie || 'distance') ? 'selected' : ''}>${m.label}</option>`).join('')}
              </select>
            </label>
            <label class="field th-planned">Date <select name="dateTheorieFormation"><option value="">—</option>${dayOptions(init.dateTheorieFormation)}</select></label>
            <label class="field th-planned">Heure de début <select name="debutTheorieFormation"><option value="">—</option>${timeOptions(init.debutTheorieFormation)}</select></label>
            <label class="field th-centre">Durée (h)
              <input type="number" name="dureeTheorieCentre" step="0.5" min="0.5" max="8"
                value="${(init.dureeTheorieCentre ?? THEORIE_CENTRE_DUREE_DEFAUT) / 60}">
            </label>
            <label class="field th-pres">Formateur théorie <select name="formateurTheorieId"><option value="">— auto —</option>${memberOptions(init.formateurTheorieId)}</select></label>
          </div>
          <p class="muted" id="theorie-info"></p>
        </div>

        <h2 style="font-size:14px; margin: 14px 0 8px;">Intervenants <span class="muted">(vide = affectation automatique)</span></h2>
        <div class="form-grid">
          <label class="field" id="formateur-field">Formateur (si ≠ jour) <select name="formateurId"><option value="">— auto —</option>${memberOptions(init.formateurId)}</select></label>
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
    entreprise: $('entreprise').value.trim() || null,
    siret: $('siret').value.trim() || null,
    statut: $('statut').value,
    motifAnnulation: $('motifAnnulation').value.trim() || null,
    formation: $('formation').value || null,
    type: $('type').value,
    datePratique: $('datePratique').value || null,
    debutPratique: $('debutPratique').value ? Number($('debutPratique').value) : null,
    dateTheorie: $('dateTheorie').value || null,
    dateTestPratique: $('dateTestPratique').value || null,
    debutTestPratique: $('debutTestPratique').value ? Number($('debutTestPratique').value) : null,
    formateurId: $('formateurId').value || null,
    testeurId: $('testeurId').value || null,
    modeTheorie: $('modeTheorie').value || 'distance',
    dateTheorieFormation: $('dateTheorieFormation').value || null,
    debutTheorieFormation: $('debutTheorieFormation').value ? Number($('debutTheorieFormation').value) : null,
    dureeTheorieCentre: $('modeTheorie').value === 'centre'
      ? Math.round((Number($('dureeTheorieCentre').value) || THEORIE_CENTRE_DUREE_DEFAUT / 60) * 60)
      : null,
    formateurTheorieId: $('modeTheorie').value === 'presentiel' ? ($('formateurTheorieId').value || null) : null,
  });

  // Annotation des intervenants : habilité / occupé / libre sur les créneaux choisis
  const annotateMembers = (draft) => {
    if (!draft.formation) return;
    const avail = memberAvailability(state, draft, editing ? editing.id : null);
    const mark = { libre: '✓', occupe: ' (occupé)', 'non-habilite': ' (non habilité)', absent: ' (absent ce jour)' };
    for (const [selName, role] of [['formateurId', 'F'], ['testeurId', 'T']]) {
      const sel = $(selName);
      for (const opt of sel.options) {
        if (!opt.value) continue;
        const a = avail.find((x) => x.id === opt.value);
        const status = a?.[role];
        const base = opt.textContent.replace(/ \((occupé|non habilité|absent ce jour)\)| ✓$/g, '');
        opt.textContent = status ? base + (status === 'libre' ? ' ✓' : mark[status]) : base;
      }
    }
  };

  // Mode guidé : les listes de dates/heures ne proposent que les jours
  // ouverts et les créneaux où une ressource habilitée, présente et libre
  // existe. Reconstruites uniquement quand leurs dépendances changent.
  let guidedKey = null;
  const syncGuided = (draft) => {
    const key = [draft.formation, draft.type, draft.datePratique, draft.dateTestPratique,
      draft.modeTheorie, draft.dateTheorieFormation, draft.dureeTheorieCentre, expert].join('|');
    if (key === guidedKey) return;
    guidedKey = key;
    const rebuildDay = (name, sel) => {
      $(name).innerHTML = '<option value="">—</option>' + dayOptions(sel);
      $(name).value = sel ?? '';
    };
    rebuildDay('datePratique', draft.datePratique);
    rebuildDay('dateTestPratique', draft.dateTestPratique);
    rebuildDay('dateTheorie', draft.dateTheorie);
    rebuildDay('dateTheorieFormation', draft.dateTheorieFormation);
    const setOptions = (name, avail, sel) => {
      const el = $(name);
      el.innerHTML = '<option value="">—</option>' + (avail == null ? timeOptions(sel) : guidedTimeOptions(avail, sel));
      el.value = sel ?? '';
    };
    const excl = editing ? editing.id : null;
    const rebuildTime = (name, role, date, sel) => {
      const avail = (!draft.formation || !date) ? null
        : availableSlotsFor(state, { formation: draft.formation, type: draft.type, date, role }, excl);
      setOptions(name, avail, sel);
    };
    rebuildTime('debutPratique', 'pratique', draft.datePratique, draft.debutPratique);
    rebuildTime('debutTestPratique', 'test', draft.dateTestPratique, draft.debutTestPratique);
    // Intervenants : ne proposer que les personnes habilitées pour la
    // formation choisie (un choix déjà enregistré non habilité reste
    // visible, marqué)
    {
      const formation = formationByCode(state.formations, draft.formation);
      for (const [name, kind, sel] of [
        ['formateurId', 'F', draft.formateurId],
        ['testeurId', 'T', draft.testeurId],
        ['formateurTheorieId', 'F', draft.formateurTheorieId],
      ]) {
        const el = $(name);
        const qualifies = (m) => !formation || !!m.quals?.[formation.code]?.[kind];
        const list = state.team.filter((m) => m.name.trim() && qualifies(m));
        const kept = sel && !list.some((m) => m.id === sel) ? state.team.find((m) => m.id === sel) : null;
        el.innerHTML = '<option value="">— auto —</option>'
          + list.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')
          + (kept ? `<option value="${kept.id}">${esc(kept.name)} (non habilité)</option>` : '');
        el.value = sel || '';
      }
    }
    // Théorie de la formation : présentiel = rejoindre une session ou en
    // ouvrir une (formateur + salle) ; centre = place de salle uniquement
    {
      const date = draft.dateTheorieFormation;
      let avail = null;
      if (draft.formation && date && draft.modeTheorie === 'presentiel') {
        avail = availableTheorieSlots(state, { formation: draft.formation, type: draft.type, date }, excl);
      } else if (date && draft.modeTheorie === 'centre') {
        avail = roomFreeSlots(state, { date, duration: draft.dureeTheorieCentre ?? THEORIE_CENTRE_DUREE_DEFAUT }, excl);
      }
      setOptions('debutTheorieFormation', avail, draft.debutTheorieFormation);
    }
  };

  // Aperçu en direct : durée, fin, contrôles
  const refresh = () => {
    const draft = readDraft();
    syncGuided(draft);
    dialog.querySelector('#motif-field').style.display = draft.statut === 'annulee' ? '' : 'none';
    const formation = formationByCode(state.formations, draft.formation);
    const duree = dureeFor(formation, draft.type);
    annotateMembers(draft);
    $('finPratique').value = draft.debutPratique != null && formation ? fmtTime(draft.debutPratique + duree) : '';
    dialog.querySelector('#duree-info').textContent = formation
      ? (formation.testOnly
        ? `Épreuve sur site : ${fmtTime(duree).replace(':', 'h')} (tenue par un testeur) — la formation ${formation.reco} se fait à distance (e-learning)`
        : `Durée de la pratique : ${fmtTime(duree).replace(':', 'h')}${formation.tests ? ` — tests obligatoires (${formation.reco})` : ' — pas de test planifié dans cet outil'}${formation.capacite > 1 ? ` — capacité simultanée : ${formation.capacite}` : ''}`)
      : '';
    dialog.querySelector('#tests-section').style.display = formation && !formation.tests ? 'none' : '';
    // Formation « épreuve seule » (AIPR) : le créneau est tenu par un testeur
    dialog.querySelector('#pratique-title').textContent = formation?.testOnly ? 'Épreuve sur site' : 'Formation pratique';
    dialog.querySelector('#formateur-field').style.display = formation?.testOnly ? 'none' : '';

    // Théorie de la formation : champs selon le mode (masquée pour les
    // formations « épreuve seule », dont la théorie est à distance par nature)
    const thSection = dialog.querySelector('#theorie-formation-section');
    thSection.style.display = formation?.testOnly ? 'none' : '';
    const mode = draft.modeTheorie;
    thSection.querySelectorAll('.th-planned').forEach((el) => { el.style.display = mode === 'distance' ? 'none' : ''; });
    thSection.querySelectorAll('.th-centre').forEach((el) => { el.style.display = mode === 'centre' ? '' : 'none'; });
    thSection.querySelectorAll('.th-pres').forEach((el) => { el.style.display = mode === 'presentiel' ? '' : 'none'; });
    dialog.querySelector('#theorie-info').textContent = mode === 'presentiel'
      ? `Session inter de ${draft.type === 'Initial' ? '7h00 (initiale)' : '3h30 (recyclage)'} — les stagiaires de la même recommandation saisis sur le même créneau partagent la session et son formateur. Capacité de salle : ${state.params.salleCapacite ?? 12} places.`
      : mode === 'centre'
        ? `Occupe une place de salle (${state.params.salleCapacite ?? 12} max) sur le créneau — aucun formateur mobilisé.`
        : 'Formation théorique à distance : aucune ressource à planifier.';

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
  dialog.querySelector('#expert-toggle').addEventListener('change', (e) => {
    expert = e.target.checked;
    guidedKey = null;
    refresh();
  });
  refresh();

  dialog.querySelector('#btn-suggest').addEventListener('click', () => {
    const draft = readDraft();
    if (!draft.stagiaire || !draft.formation) {
      dialog.querySelector('#suggest-info').textContent = 'Renseignez d’abord le stagiaire et la formation.';
      return;
    }
    const found = suggestSlots(state, draft, editing ? editing.id : null);
    if (!found) {
      dialog.querySelector('#suggest-info').textContent = 'Aucune combinaison libre trouvée sur les jours EFI ouverts.';
      return;
    }
    $('datePratique').value = found.datePratique;
    $('debutPratique').value = found.debutPratique;
    $('dateTestPratique').value = found.dateTestPratique || '';
    $('debutTestPratique').value = found.debutTestPratique ?? '';
    $('dateTheorie').value = found.dateTheorie || '';
    dialog.querySelector('#suggest-info').textContent = 'Créneaux proposés — vérifiez et ajustez si besoin.';
    refresh();
  });

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
