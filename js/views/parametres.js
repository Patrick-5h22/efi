// Paramètres : formations/durées/capacités, horaires, tests, charge
// (équivalent de l'onglet « Paramètres »).

import { app, esc, toast, telechargerSauvegarde } from '../app.js';
import { fmtTime, parseTime, fmtDateShort, fenetreAffichage, SEMAINES_AFFICHEES } from '../dates.js';
import { defaultState, seedExamples, saveState, viderInscriptions } from '../store.js';
import {
  chevauchePause, MODALITES_SEANCE, modaliteDe, appliquerModalite,
  referencesInconnues, siteById, formationByCode,
} from '../config.js';

// Activer la pause fait basculer en anomalie les séances déjà posées qui la
// chevauchent. On le dit AVANT, avec le compte exact — et on le redit après,
// pour que le chiffre ne soit pas une surprise dans la liste des anomalies.
function pauseAlerte(state, p) {
  const test = { ...p, pauseActive: true };
  const rows = app.schedule?.rows || [];
  let touchees = 0;
  for (const r of rows) {
    if (r.cancelled) continue;
    const i = r.insc;
    const gene = chevauchePause(test, i.debutPratique, r.finPratique)
      || chevauchePause(test, i.debutTestPratique, r.finTestPratique)
      || (i.modeTheorie === 'centre' && chevauchePause(test, i.debutTheorieFormation, r.finTheorieFormation));
    if (gene) touchees += 1;
  }

  const items = [];
  if (touchees) {
    items.push(p.pauseActive
      ? `<b>${touchees} inscription(s)</b> chevauchent la pause et sont signalées en anomalie.`
      : `Activer la pause ferait basculer <b>${touchees} inscription(s)</b> en anomalie : elles la chevauchent déjà.`);
  }
  if (chevauchePause(test, p.theoryTime, p.theoryTime + p.theoryDuration)) {
    items.push(`Le créneau du test théorique (${fmtTime(p.theoryTime)}) tombe dans la pause : le décaler avant de l’activer.`);
  }
  if (!items.length) return '';
  return `<div class="callout" style="border-left:3px solid var(--warn);padding-left:10px;margin-top:10px">
    <ul class="plain-list">${items.map((t) => `<li>${t}</li>`).join('')}</ul>
  </div>`;
}

// Dispositifs admis par une zone ou requis par un matériel, dits en clair.
// Une recommandation entière vaut mieux que ses catégories énumérées : les
// zones de Périgny II admettent « toute la R482 », y compris les catégories
// qui n'existent pas encore au catalogue.
function admisEnClair(state, porteur) {
  const parts = [
    ...(porteur.recos || []).map((r) => `<b>toute la ${esc(r)}</b>`),
    ...(porteur.dispositifs || []).map((c) => esc(formationByCode(state.formations, c)?.label || c)),
  ];
  return parts.length ? parts.join(', ') : '<span class="muted">aucun</span>';
}

export function renderParametres(main) {
  const state = app.state;
  const p = state.params;
  const fenetre = fenetreAffichage();

  main.innerHTML = `
    <div class="page-header">
      <h1>Paramètres</h1>
      <span class="sub">Formations, horaires et règles de charge — appliqués immédiatement à tous les contrôles</span>
    </div>

    <div class="card">
      <h2>1. Catalogue des formations</h2>
      <div class="table-wrap">
        <table class="data">
          <thead><tr>
            <th>Code</th><th>Formation</th><th>Recommandation</th><th>Séance</th>
            <th>Durée Initial (h)</th><th>Durée Recyclage (h)</th><th>Tests obligatoires</th>
            <th>Durée test (h)</th><th>Capacité simultanée</th><th>Charge comptée</th><th></th>
          </tr></thead>
          <tbody>
            ${state.formations.map((f, idx) => `
              <tr>
                <td><b>${esc(f.code)}</b></td>
                <td><input value="${esc(f.label)}" data-f="${idx}|label" style="min-width:170px"></td>
                <td><input value="${esc(f.reco)}" data-f="${idx}|reco" style="width:90px"></td>
                <td>
                  <select data-f="${idx}|modalite">
                    ${MODALITES_SEANCE.map((m) => `<option value="${m.id}"
                      ${modaliteDe(f) === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}
                  </select>
                </td>
                <td><input type="number" step="0.5" min="0.5" max="8" value="${f.dureeInitial / 60}" data-f="${idx}|dureeInitial" style="width:70px"></td>
                <td><input type="number" step="0.5" min="0.5" max="8" value="${f.dureeRecyclage / 60}" data-f="${idx}|dureeRecyclage" style="width:70px"></td>
                <td style="text-align:center">${f.testOnly
                  ? '<span class="muted" title="Épreuve surveillée : la formation se fait à distance, seule l’épreuve est planifiée — pas de tests séparés">épreuve seule</span>'
                  : f.testSurveille
                  ? '<span class="muted" title="L’épreuve surveillée occupe le créneau de test : elle est obligatoire">épreuve</span>'
                  : `<input type="checkbox" ${f.tests ? 'checked' : ''} data-f="${idx}|tests">`}</td>
                <td>${f.testOnly ? '<span class="muted">—</span>'
                  : `<input type="number" step="0.5" min="0.5" max="4" value="${f.dureeTest ? f.dureeTest / 60 : ''}"
                      placeholder="${p.practicalTestDuration / 60}" data-f="${idx}|dureeTest" style="width:80px"
                      title="Vide : la durée générale ci-dessous s’applique">`}</td>
                <td><input type="number" min="1" max="12" value="${f.capacite}" data-f="${idx}|capacite" style="width:60px"></td>
                <td style="text-align:center"><input type="checkbox" ${f.chargeComptee !== false ? 'checked' : ''} data-f="${idx}|chargeComptee" title="Décoché : la séance mobilise un intervenant mais sort du plafond quotidien (surveillance)"></td>
                <td><button class="btn btn-danger btn-sm" data-del-formation="${idx}" title="Retirer du catalogue">🗑</button></td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>

      <div class="form-row" style="margin-top:12px;align-items:flex-end">
        <label class="field">Code <input id="nf-code" placeholder="R482-B" style="width:110px" maxlength="16"></label>
        <label class="field">Formation <input id="nf-label" placeholder="Pratique R482 Cat B" style="min-width:190px"></label>
        <label class="field">Recommandation <input id="nf-reco" placeholder="R482" style="width:100px"></label>
        <label class="field">Séance
          <select id="nf-modalite">
            ${MODALITES_SEANCE.map((m) => `<option value="${m.id}">${m.label}</option>`).join('')}
          </select>
        </label>
        <label class="field">Initial (h) <input type="number" id="nf-init" step="0.5" min="0.5" max="8" value="1.5" style="width:80px"></label>
        <label class="field">Recyclage (h) <input type="number" id="nf-recy" step="0.5" min="0.5" max="8" value="1" style="width:90px"></label>
        <label class="field">Durée test (h) <input type="number" id="nf-dtest" step="0.5" min="0.5" max="4"
          placeholder="${p.practicalTestDuration / 60}" style="width:100px" title="Vide : la durée générale s’applique"></label>
        <label class="field">Capacité <input type="number" id="nf-cap" min="1" max="12" value="1" style="width:80px"></label>
        <label class="expert-toggle"><input type="checkbox" id="nf-tests" checked> Tests obligatoires</label>
        <label class="expert-toggle"><input type="checkbox" id="nf-charge" checked> Charge comptée</label>
        <button class="btn" id="btn-add-formation">➕ Ajouter la formation</button>
      </div>

      <p class="muted">La capacité simultanée > 1 (ex. R489 Cat 3 : 2 chariots) autorise plusieurs candidats en même temps avec le même formateur, sur la même catégorie uniquement.
      « Épreuve surveillée » = la formation se fait à distance et seule l'épreuve est planifiée, tenue par un testeur (AIPR).
      « Formation + épreuve surveillée » = la même AIPR vendue avec sa formation sur site : un formateur, puis l'épreuve au créneau de test.
      « Durée test » laissée vide = la durée générale s'applique ; renseignée, elle l'emporte pour cette formation (le QCM AIPR tient 2h00 quand un test R489 tient 1h00).
      « Charge comptée » décochée = la séance n'entre pas dans le plafond quotidien ni dans le taux d'occupation.
      Le code n'est pas modifiable après création : il relie la formation aux inscriptions et aux habilitations.
      Toute formation ajoutée apparaît automatiquement dans l'onglet Équipe — pensez à y cocher les habilitations F/T.</p>
    </div>

    <div class="card">
      <h2>1 bis. Sites, zones d'évolution et matériels partagés</h2>
      <p class="callout" style="border-left:3px solid var(--warn);padding-left:10px">
      <b>Paramétrage seul pour l'instant.</b> Ces zones et ce matériel sont enregistrés et modifiables, mais le planning
      ne s'en sert pas encore : aucune séance n'est refusée pour cause de zone occupée, et la règle de pôle
      (Saintes ↔ Périgny dans la même journée) n'est pas encore appliquée. Ce sera le lot suivant.</p>
      <p class="muted">Le choix du site précède la programmation : il déterminera les formations proposables et les zones disponibles.
      Une zone porte les dispositifs qu'elle admet et son nombre de <b>sessions simultanées</b> — c'est de là que découlent
      la mutualisation R485 / R489 1A-1B (une zone, quatre dispositifs, une session) et les deux zones Cat 3/5 en parallèle,
      sans qu'aucune règle particulière n'ait à exister.</p>

      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>Site</th><th>Pôle</th><th>Zones</th></tr></thead>
          <tbody>
            ${state.sites.map((site) => `
              <tr>
                <td><b>${esc(site.label)}</b></td>
                <td>${esc(site.pole)}</td>
                <td>${state.zones.filter((z) => z.siteId === site.id).length}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p class="muted">Deux sites d'un même <b>pôle</b> s'enchaînent dans une journée, deux pôles différents non :
      Périgny ↔ Périgny II oui, Saintes non. Une comparaison de pôles remplace une matrice de temps de trajet
      que personne ne tiendrait à jour.</p>

      <div class="table-wrap" style="margin-top:14px">
        <table class="data">
          <thead><tr>
            <th>Zone</th><th>Site</th><th>Dispositifs admis</th><th>Sessions simultanées</th>
          </tr></thead>
          <tbody>
            ${state.zones.map((z, idx) => {
    const inconnues = referencesInconnues(z, state.formations);
    return `
              <tr>
                <td><input value="${esc(z.label)}" data-z="${idx}|label" style="min-width:210px"></td>
                <td>${esc(siteById(state.sites, z.siteId)?.label || z.siteId)}</td>
                <td>${admisEnClair(state, z)}
                  ${inconnues.length ? `<span class="badge badge-warn" title="Absent du catalogue : la zone n’admet rien de ce nom, tant que la formation n’est pas créée">sans effet : ${esc(inconnues.join(', '))}</span>` : ''}</td>
                <td><input type="number" min="1" max="6" value="${z.sessions}" data-z="${idx}|sessions" style="width:70px"></td>
              </tr>`;
  }).join('')}
          </tbody>
        </table>
      </div>

      <div class="table-wrap" style="margin-top:14px">
        <table class="data">
          <thead><tr>
            <th>Matériel partagé</th><th>Site</th><th>Requis par</th><th>Exemplaires</th>
          </tr></thead>
          <tbody>
            ${state.ressources.length ? state.ressources.map((r, idx) => {
    const inconnues = referencesInconnues(r, state.formations);
    return `
              <tr>
                <td><input value="${esc(r.label)}" data-r="${idx}|label" style="min-width:180px"></td>
                <td>${esc(siteById(state.sites, r.siteId)?.label || r.siteId)}</td>
                <td>${admisEnClair(state, r)}
                  ${inconnues.length ? `<span class="badge badge-warn" title="Absent du catalogue : la contrainte ne s’applique à rien, tant que la formation n’est pas créée">sans effet : ${esc(inconnues.join(', '))}</span>` : ''}</td>
                <td><input type="number" min="1" max="6" value="${r.capacite}" data-r="${idx}|capacite" style="width:70px"></td>
              </tr>`;
  }).join('') : '<tr><td colspan="4" class="muted">Aucun matériel partagé déclaré.</td></tr>'}
          </tbody>
        </table>
      </div>
      <p class="muted">Un matériel partagé est un <b>exemplaire unique utilisé par plusieurs zones</b> — le porte-engin de Périgny II,
      accessible des deux côtés mais tenant une seule catégorie à la fois, en formation comme en test. Le déclarer ainsi, plutôt
      qu'en liste d'exclusions, permet d'en ajouter d'autres sans règle nouvelle.
      <b>« Sans effet »</b> signale un nom absent du catalogue : les deux zones de Périgny II et le porte-engin
      visent la <b>R482</b>, qui reste à créer — d'ici là, ils n'admettent et ne contraignent rien.</p>
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
      <h2>2 bis. Pause déjeuner</h2>
      <div class="form-row">
        <label class="expert-toggle"><input type="checkbox" ${p.pauseActive ? 'checked' : ''} data-p="pauseActive" data-bool> Réserver la pause déjeuner</label>
        <label class="field">Début <input value="${fmtTime(p.pauseDebut ?? 720)}" data-p="pauseDebut" data-time></label>
        <label class="field">Fin <input value="${fmtTime(p.pauseFin ?? 780)}" data-p="pauseFin" data-time></label>
      </div>
      <p class="muted">Une fois active, aucune pratique, aucun test et aucune théorie en centre ne peut la chevaucher.
      Seule la <b>théorie présentielle</b> l’enjambe : une session initiale dure 7h00, elle ne tient dans aucune demi-journée.</p>
      ${pauseAlerte(state, p)}
    </div>

    <div class="card">
      <h2>3. Jours fériés</h2>
      <p class="muted" style="margin-bottom:8px">Les grilles et le tableau de bord affichent
      <b>${SEMAINES_AFFICHEES} semaines à partir de la semaine en cours</b> (${fmtDateShort(fenetre.debut)}
      → ${fmtDateShort(fenetre.fin)}) : la fenêtre glisse d'elle-même, il n'y a pas de dates à régler.
      Les dates de début et de fin de période ont été retirées — réglées à la main, elles faisaient
      basculer en anomalie toute séance planifiée avant le début, alors qu'elle était seulement passée.</p>
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
        <button class="btn btn-danger" id="btn-vider-inscriptions"
          title="Retire toutes les lignes d’inscription. L’équipe, les jours EFI, la présence des intervenants, le catalogue et les paramètres sont conservés.">🗑 Vider les inscriptions${state.inscriptions.length ? ` (${state.inscriptions.length})` : ''}</button>
        <button class="btn btn-danger" id="btn-reset">Réinitialiser toutes les données</button>
      </div>
      <p class="muted">⚠ Les lignes d'exemple sont à supprimer avant utilisation réelle (comme dans le classeur).
      L'export JSON (barre latérale) permet de sauvegarder avant toute manipulation.</p>
      <p class="muted"><b>Vider les inscriptions</b> ne touche qu'aux lignes : l'équipe, les jours EFI ouverts,
      la présence des intervenants, le catalogue et les paramètres restent en place — de quoi repartir d'un
      planning vide pour une campagne de tests sans reperdre une configuration saisie jour par jour.
      Une sauvegarde JSON est téléchargée <b>avant</b> la suppression, et <kbd>Ctrl</kbd>+<kbd>Z</kbd> l'annule.
      <b>Réinitialiser toutes les données</b>, elle, emporte tout et resème les quatre exemples.</p>
    </div>
  `;

  main.querySelectorAll('[data-f]').forEach((input) => {
    input.addEventListener('change', () => {
      const [idx, field] = input.dataset.f.split('|');
      const f = state.formations[Number(idx)];
      if (field === 'tests' || field === 'chargeComptee') f[field] = input.checked;
      else if (field === 'modalite') {
        appliquerModalite(f, input.value);
        renderParametres(main); // les colonnes Tests et Durée test changent de nature
      } else if (field === 'dureeTest') {
        // Vide = « prendre la durée générale » : on enregistre null, et non 0.
        const v = Number(input.value);
        f.dureeTest = input.value.trim() && v > 0 ? Math.round(v * 60) : null;
      } else if (field === 'capacite') f.capacite = Math.max(1, Number(input.value) || 1);
      else if (field === 'label' || field === 'reco') {
        const v = input.value.trim();
        if (!v) { toast('Ce champ ne peut pas être vide.', 'error'); input.value = f[field]; return; }
        f[field] = v;
      } else f[field] = Math.round((Number(input.value) || 1) * 60);
      app.commit();
      toast('Paramètre enregistré.', 'ok');
    });
  });

  // Zones et matériels partagés : libellé et nombre de sessions / exemplaires.
  // La liste des dispositifs admis n'est pas encore modifiable ici — elle est
  // livrée d'après la spécification et vaudra un écran à elle.
  const champNombre = (input, mini) => {
    const v = Math.round(Number(input.value));
    return Number.isFinite(v) && v >= mini ? v : null;
  };
  main.querySelectorAll('[data-z], [data-r]').forEach((input) => {
    input.addEventListener('change', () => {
      const zone = 'z' in input.dataset;
      const [idx, field] = (zone ? input.dataset.z : input.dataset.r).split('|');
      const cible = (zone ? state.zones : state.ressources)[Number(idx)];
      if (!cible) return;
      if (field === 'label') {
        const v = input.value.trim();
        if (!v) { toast('Le libellé ne peut pas être vide.', 'error'); input.value = cible.label; return; }
        cible.label = v;
      } else {
        // Zéro session ne veut pas dire « illimité » mais « zone inutilisable » :
        // on refuse plutôt que d'enregistrer une zone qui n'admet plus rien
        // sans que personne ne l'ait voulu.
        const v = champNombre(input, 1);
        if (v === null) {
          toast(zone ? 'Une zone tient au moins une session.' : 'Un matériel compte au moins un exemplaire.', 'error');
          input.value = cible[field];
          return;
        }
        cible[field] = v;
      }
      app.commit();
      toast('Paramètre enregistré.', 'ok');
    });
  });

  main.querySelector('#btn-add-formation').addEventListener('click', () => {
    const code = main.querySelector('#nf-code').value.trim().toUpperCase();
    const label = main.querySelector('#nf-label').value.trim();
    const reco = main.querySelector('#nf-reco').value.trim().toUpperCase();
    if (!code || !label || !reco) { toast('Code, formation et recommandation sont obligatoires.', 'error'); return; }
    if (state.formations.some((f) => f.code.toUpperCase() === code)) { toast(`Le code « ${code} » existe déjà.`, 'error'); return; }
    const hours = (sel) => Math.round((Number(main.querySelector(sel).value) || 1) * 60);
    const dtest = Number(main.querySelector('#nf-dtest').value);
    state.formations.push(appliquerModalite({
      code, label, reco,
      dureeInitial: hours('#nf-init'),
      dureeRecyclage: hours('#nf-recy'),
      tests: main.querySelector('#nf-tests').checked,
      dureeTest: dtest > 0 ? Math.round(dtest * 60) : null,
      capacite: Math.max(1, Number(main.querySelector('#nf-cap').value) || 1),
      chargeComptee: main.querySelector('#nf-charge').checked,
    }, main.querySelector('#nf-modalite').value));
    app.commit();
    renderParametres(main);
    toast(`Formation « ${code} » ajoutée — cochez ses habilitations dans Équipe.`, 'ok');
  });

  main.querySelectorAll('[data-del-formation]').forEach((b) => {
    b.addEventListener('click', () => {
      const f = state.formations[Number(b.dataset.delFormation)];
      // Une formation référencée par des inscriptions ne peut pas disparaître :
      // les lignes deviendraient orphelines et illisibles.
      const used = state.inscriptions.filter((i) => i.formation === f.code).length;
      if (used) { toast(`« ${f.code} » est utilisée par ${used} inscription(s) : retirez-les d'abord.`, 'error'); return; }
      if (state.formations.length <= 1) { toast('Le catalogue doit garder au moins une formation.', 'error'); return; }
      if (!confirm(`Retirer « ${f.label} » (${f.code}) du catalogue ?\nLes habilitations correspondantes de l'équipe seront effacées.`)) return;
      state.formations = state.formations.filter((x) => x.code !== f.code);
      for (const m of state.team) { if (m.quals) delete m.quals[f.code]; }
      app.commit();
      renderParametres(main);
      toast(`Formation « ${f.code} » retirée.`, 'ok');
    });
  });

  main.querySelectorAll('[data-p]').forEach((input) => {
    input.addEventListener('change', () => {
      const key = input.dataset.p;
      if ('bool' in input.dataset) {
        state.params[key] = input.checked;
      } else if ('time' in input.dataset) {
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

  // Suppression en masse : la sauvegarde part AVANT, pas après. Un
  // téléchargement refusé par le navigateur annule la suppression — mieux
  // vaut ne rien faire que détruire sans filet.
  main.querySelector('#btn-vider-inscriptions').addEventListener('click', () => {
    const n = state.inscriptions.length;
    if (!n) return toast('Aucune inscription à supprimer.');
    if (!confirm(`Supprimer les ${n} inscription(s) de tous les stagiaires ?\n\n`
      + 'Conservés : équipe, jours EFI ouverts, présence des intervenants, catalogue, paramètres.\n'
      + 'Une sauvegarde JSON est téléchargée avant la suppression, et Ctrl+Z l’annule.')) return;
    let fichier;
    try {
      fichier = telechargerSauvegarde(state, 'avant-vidage');
    } catch (e) {
      return toast('Sauvegarde impossible (' + e.message + ') — rien n’a été supprimé.', 'error');
    }
    viderInscriptions(state);
    app.commit();
    toast(`${n} inscription(s) supprimée(s). Sauvegarde : ${fichier}`, 'ok');
  });

  main.querySelector('#btn-reset').addEventListener('click', () => {
    if (!confirm('Réinitialiser TOUTES les données (inscriptions, équipe, jours, paramètres) ?')) return;
    app.state = seedExamples(defaultState());
    saveState(localStorage, app.state);
    app.commit();
    toast('Données réinitialisées.', 'ok');
  });
}
