// Saisie d'un PARCOURS : une recommandation, plusieurs catégories, une date de
// départ — et le moteur place le tout.
//
// La saisie ligne par ligne reste là et reste juste : elle sert à corriger, à
// déplacer, à imposer un formateur. Mais vendre « R489 Cat 1A + 3 + 5 »
// demandait d'ouvrir trois fois le formulaire, de retrouver chaque fois le
// parcours ouvert, et de poser six séances à la main en évitant les
// chevauchements. C'est exactement ce que suggestParcours fait déjà pour le
// serveur MCP — l'assistante n'avait simplement pas de bouton pour y accéder.
//
// Rien de nouveau dans le moteur, donc : cet écran est une porte d'entrée. Il
// propose, il n'impose pas ; les séances restent modifiables une à une ensuite.

import { app, esc, toast } from '../app.js';
import { addInscription, addParcours, montantOuNull } from '../store.js';
import { recommandations, categoriesDe, libelleCourt, TYPES } from '../config.js';
import { fmtTime, fmtDateDay, workingDays } from '../dates.js';
import { suggestParcours } from '../engine.js';

let dialog = null;

export function openParcoursForm() {
  if (dialog) dialog.remove();
  const state = app.state;
  const recos = recommandations(state.formations);
  const jours = workingDays(state.params);

  // Dernière proposition calculée. Conservée pour que « Enregistrer » pose
  // exactement ce que l'écran montre, et non un second calcul qui pourrait
  // différer si le planning a bougé entre-temps.
  let propositions = [];
  let choisie = 0;

  dialog = document.createElement('dialog');
  dialog.innerHTML = `
    <form method="dialog" id="parcours-form">
      <div class="dialog-header">
        <h2>Inscrire un parcours</h2>
        <button type="button" class="dialog-close" aria-label="Fermer">✕</button>
      </div>
      <div class="dialog-body">
        <div class="form-grid">
          <label class="field" style="grid-column: span 2;">Stagiaire (NOM Prénom)
            <input name="stagiaire" required list="pf-stagiaires" placeholder="DUPONT Jean">
            <datalist id="pf-stagiaires">
              ${[...new Set(state.inscriptions.map((i) => i.stagiaire))].map((s) => `<option value="${esc(s)}">`).join('')}
            </datalist>
          </label>
          <label class="field">Entreprise <input name="entreprise" placeholder="(facultatif)"></label>
          <label class="field">SIRET <input name="siret" placeholder="(facultatif)" inputmode="numeric" maxlength="14"></label>

          <label class="field">Recommandation
            <select name="reco" required>
              ${recos.map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join('')}
            </select>
          </label>
          <label class="field">Régime
            <select name="type">${TYPES.map((t) => `<option value="${t}">${t}</option>`).join('')}</select>
          </label>

          <div class="field" style="grid-column: span 2;">
            <span>Catégories <span class="muted">(une ou plusieurs)</span></span>
            <div id="pf-cats" class="form-row" style="flex-wrap:wrap;gap:10px;margin-top:6px"></div>
          </div>

          <label class="field">À partir du
            <select name="aPartirDu">
              <option value="">— au plus tôt —</option>
              ${jours.map((d) => `<option value="${d}">${fmtDateDay(d)}</option>`).join('')}
            </select>
          </label>
          <label class="field">Statut
            <select name="statut">
              <option value="confirmee">Confirmé</option>
              <option value="pre">Pré-réservé</option>
            </select>
          </label>

          <label class="field">N° de dossier YPAREO
            <input name="dossierYpareo" placeholder="10 chiffres" inputmode="numeric" maxlength="10">
          </label>
          <label class="field">Chiffre d’affaires (€)
            <input name="chiffreAffaires" type="number" min="0" step="0.01" placeholder="(facultatif)"
              title="Montant facturé pour l’ensemble du parcours">
          </label>
        </div>

        <p class="muted" style="margin-top:10px">Le montant et le n° de dossier appartiennent au
        <b>parcours</b> : une seule saisie couvre toutes les catégories choisies.</p>

        <div class="form-row" style="margin-top:12px">
          <button type="button" class="btn btn-secondary" id="pf-chercher">🔎 Proposer des dates</button>
          <span class="muted" id="pf-info"></span>
        </div>

        <div id="pf-apercu" style="margin-top:12px"></div>
      </div>
      <div class="dialog-footer">
        <button type="button" class="btn btn-secondary" id="pf-cancel">Annuler</button>
        <button type="submit" class="btn" id="pf-save" disabled>Enregistrer le parcours</button>
      </div>
    </form>
  `;
  document.body.appendChild(dialog);

  const form = dialog.querySelector('#parcours-form');
  const $ = (n) => form.elements[n];
  const info = dialog.querySelector('#pf-info');
  const apercu = dialog.querySelector('#pf-apercu');
  const save = dialog.querySelector('#pf-save');

  // --- Catégories de la recommandation choisie ---------------------------
  const rendreCategories = () => {
    const cats = categoriesDe(state.formations, $('reco').value);
    dialog.querySelector('#pf-cats').innerHTML = cats.length
      ? cats.map((f) => `<label class="expert-toggle">
          <input type="checkbox" name="cat" value="${esc(f.code)}"> ${esc(libelleCourt(f))}
        </label>`).join('')
      : '<span class="muted">Aucune catégorie au catalogue pour cette recommandation.</span>';
    invalider();
  };

  const codesChoisis = () => [...dialog.querySelectorAll('input[name=cat]:checked')].map((c) => c.value);

  // Toute modification invalide la proposition affichée : l'enregistrer après
  // avoir changé les catégories poserait autre chose que ce qui est montré.
  const invalider = () => {
    propositions = [];
    choisie = 0;
    apercu.innerHTML = '';
    save.disabled = true;
    info.textContent = '';
  };
  form.addEventListener('input', invalider);
  form.addEventListener('change', invalider);
  $('reco').addEventListener('change', rendreCategories);
  rendreCategories();

  // --- Proposition --------------------------------------------------------
  dialog.querySelector('#pf-chercher').addEventListener('click', () => {
    const stagiaire = $('stagiaire').value.trim();
    const codes = codesChoisis();
    if (!stagiaire) { toast('Le nom du stagiaire est obligatoire.', 'error'); return; }
    if (!codes.length) { toast('Choisissez au moins une catégorie.', 'error'); return; }

    propositions = suggestParcours(state, {
      stagiaire, formations: codes, type: $('type').value,
      aPartirDu: $('aPartirDu').value || null, maxOptions: 2,
    });
    choisie = 0;
    if (!propositions.length) {
      apercu.innerHTML = '';
      save.disabled = true;
      info.innerHTML = '<b>Aucune date ne convient</b> — plateau complet, intervenant manquant '
        + 'ou site fermé. Essayez une autre date de départ, ou moins de catégories.';
      return;
    }
    info.textContent = '';
    rendreApercu();
  });

  const rendreApercu = () => {
    const opt = propositions[choisie];
    save.disabled = false;
    apercu.innerHTML = `
      ${propositions.length > 1 ? `<div class="form-row" style="margin-bottom:8px">
        ${propositions.map((o, k) => `<button type="button" class="btn ${k === choisie ? '' : 'btn-secondary'} btn-sm"
          data-opt="${k}">Option ${k + 1} — ${fmtDateDay(o.jours[0])}</button>`).join('')}
      </div>` : ''}
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Jour</th><th>Horaire</th><th>Séance</th><th>Intervenant</th></tr></thead>
          <tbody>
            ${opt.seances.map((s) => `<tr>
              <td>${fmtDateDay(s.date)}</td>
              <td class="mono">${fmtTime(s.debut)} → ${fmtTime(s.fin)}</td>
              <td>${esc(s.libelle)}</td>
              <td>${esc(s.intervenant || '—')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="muted">${opt.lignes.length} séance(s) de plateau sur ${opt.jours.length} journée(s).
      Les dates restent modifiables une à une après l’enregistrement.</p>`;
    apercu.querySelectorAll('[data-opt]').forEach((b) => b.addEventListener('click', () => {
      choisie = Number(b.dataset.opt);
      rendreApercu();
    }));
  };

  // --- Enregistrement -----------------------------------------------------
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const opt = propositions[choisie];
    if (!opt) { toast('Demandez d’abord une proposition de dates.', 'error'); return; }

    const parcours = addParcours(state, {
      dossierYpareo: $('dossierYpareo').value.trim() || null,
      chiffreAffaires: montantOuNull($('chiffreAffaires').value),
    });
    const commun = {
      entreprise: $('entreprise').value.trim() || null,
      siret: $('siret').value.trim() || null,
      statut: $('statut').value,
      parcoursId: parcours.id,
      modeTheorie: 'distance',
    };
    // « id », « statut » et « parcoursId » viennent de la simulation du
    // moteur : les laisser passer écraserait la numérotation réelle et le
    // statut choisi ici. addInscription attribue un vrai identifiant, et
    // « commun » impose le reste.
    const SIMULES = new Set(['id', 'statut', 'parcoursId']);
    for (const ligne of opt.lignes) {
      const reste = Object.fromEntries(Object.entries(ligne).filter(([k]) => !SIMULES.has(k)));
      addInscription(state, { ...reste, ...commun });
    }
    app.commit();
    toast(`${opt.lignes.length} séance(s) inscrites — parcours n°${parcours.id}.`, 'ok');
    close();
  });

  const close = () => { dialog.close(); dialog.remove(); dialog = null; };
  dialog.querySelector('.dialog-close').addEventListener('click', close);
  dialog.querySelector('#pf-cancel').addEventListener('click', close);
  dialog.addEventListener('cancel', () => { dialog.remove(); dialog = null; });

  dialog.showModal();
  $('stagiaire').focus();
}
