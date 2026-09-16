// Grilles hebdomadaires FORMATEUR / TESTEUR — équivalent des onglets « Semaine 36 » à « Semaine 53 ».
// Code couleur : neutre = libre (clic = inscrire), vert = confirmée, jaune =
// pré-réservée, bleu = théorie, violet = épreuve surveillée, gris = fermé.

import { app, esc, navigate } from '../app.js';
import { memberName } from '../store.js';
import { periodWeeks, weekDays, daySlots, fmtTime, fmtDateDay, fmtDateShort, isWeekend, semaineParDefaut } from '../dates.js';
import { unionDuration } from '../engine.js';
import { chargeComptee, chevauchePause } from '../config.js';
import { openInscriptionForm } from './form.js';
import { largeurMinGrille } from './grille.js';

export function renderSemaine(main, args) {
  const state = app.state;
  const weeks = periodWeeks(state.params);
  // Par défaut, la semaine EN COURS — pas la première semaine qui porte une
  // inscription, qui laissait la vue figée sur le passé.
  const defaultWeek = semaineParDefaut(state.params, weeks) || weeks[0].week;
  const weekNum = Number(args[0]) || defaultWeek;
  const week = weeks.find((w) => w.week === weekNum) || weeks[0];
  const days = weekDays(week.monday);
  const idx = weeks.findIndex((w) => w.week === week.week);

  main.innerHTML = `
    <div class="page-header">
      <h1>Semaine ${week.week}</h1>
      <span class="sub">du ${fmtDateShort(days[0])} au ${fmtDateShort(days[4])}</span>
      <div class="page-actions">
        <button class="btn btn-secondary" id="w-prev" ${idx === 0 ? 'disabled' : ''}>← S${idx > 0 ? weeks[idx - 1].week : ''}</button>
        <select id="w-select">${weeks.map((w) => `<option value="${w.week}" ${w.week === week.week ? 'selected' : ''}>Semaine ${w.week}</option>`).join('')}</select>
        <button class="btn btn-secondary" id="w-next" ${idx === weeks.length - 1 ? 'disabled' : ''}>S${idx < weeks.length - 1 ? weeks[idx + 1].week : ''} →</button>
        <a class="btn btn-secondary" href="#/synthese/${week.week}">📋 Synthèse</a>
        <button class="btn btn-secondary" onclick="window.print()">🖨</button>
        <button class="btn" id="btn-add">➕ Inscrire</button>
      </div>
    </div>

    <div class="legend no-print">
      <span><span class="chip" style="background:var(--free)"></span>Libre (cliquer pour inscrire)</span>
      <span><span class="chip" style="background:var(--confirmed);border-color:var(--confirmed-border)"></span>Confirmée</span>
      <span><span class="chip" style="background:var(--pre);border-color:var(--pre-border); outline:1px dashed var(--warn); outline-offset:-2px"></span>Pré-réservée</span>
      <span><span class="chip" style="background:var(--theory-bg);border-color:var(--theory-border)"></span>Théorie</span>
      <span><span class="chip" style="background:var(--exam-bg);border-color:var(--exam-border)"></span>Épreuve surveillée (AIPR) — ne mobilise pas l'intervenant</span>
      <span><span class="chip" style="background:var(--closed)"></span>Fermé</span>
      ${state.params.pauseActive ? '<span><span class="chip slot-pause"></span>Pause déjeuner</span>' : ''}
    </div>

    <div class="card">
      <h2>👷 FORMATEUR — formations pratiques</h2>
      <div class="grid-wrap">${gridHTML(state, days, 'F')}</div>
    </div>
    <div class="card">
      <h2>🔎 TESTEUR — test théorique & tests pratiques</h2>
      <div class="grid-wrap">${gridHTML(state, days, 'T')}</div>
    </div>
  `;

  main.querySelector('#w-select').addEventListener('change', (e) => navigate(`semaine/${e.target.value}`));
  main.querySelector('#w-prev')?.addEventListener('click', () => navigate(`semaine/${weeks[idx - 1].week}`));
  main.querySelector('#w-next')?.addEventListener('click', () => navigate(`semaine/${weeks[idx + 1].week}`));
  main.querySelector('#btn-add').addEventListener('click', () => openInscriptionForm());

  main.querySelectorAll('td.slot-free').forEach((td) => {
    const open = () => openInscriptionForm(td.dataset.kind === 'F'
      ? { datePratique: td.dataset.date, debutPratique: Number(td.dataset.time) }
      : { dateTestPratique: td.dataset.date, debutTestPratique: Number(td.dataset.time) });
    td.addEventListener('click', open);
    td.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    td.title = `${fmtDateDay(td.dataset.date)} ${fmtTime(Number(td.dataset.time))} — ` + (td.dataset.kind === 'F'
      ? 'inscrire une formation pratique'
      : 'réserver un test pratique');
  });

  // Clic sur une inscription = l'éditer. Le point d'entrée est la LIGNE, pas
  // la cellule : une séance à deux stagiaires offre donc deux portes, et le
  // formulaire sait laquelle ouvrir. Rien n'est câblé sur la cellule elle-même
  // — un clic sur la ligne y remonterait et ouvrirait le formulaire deux fois.
  main.querySelectorAll('.cell-entry[data-insc]').forEach((el) => {
    const open = () => openInscriptionForm({ id: Number(el.dataset.insc) });
    el.addEventListener('click', open);
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
    });
  });
}

// Réunit les créneaux voisins qui disent la même chose en une seule cellule.
//
// Sans cela, une séance d'une heure occupe deux colonnes de trente minutes et
// y répète son libellé — nom du stagiaire, catégorie, intervenant — deux fois,
// et un jour fermé écrit « FERMÉ » dix-huit fois. Ce contenu répété élargissait
// les colonnes occupées et rétrécissait les autres : les deux grilles
// n'avaient plus les mêmes largeurs, et 10:00 chez le formateur ne tombait pas
// sous 10:00 chez le testeur.
//
// Une case de clé « null » ne fusionne jamais (les créneaux libres restent
// cliquables à leur propre heure).
function fusionner(cases) {
  const groupes = [];
  for (const c of cases) {
    const dernier = groupes[groupes.length - 1];
    if (dernier && c.cle != null && dernier.cle === c.cle) { dernier.n += 1; continue; }
    groupes.push({ ...c, n: 1 });
  }
  return groupes.map((g) => `<td class="${g.cls}"${g.n > 1 ? ` colspan="${g.n}"` : ''}${g.attrs || ''}>${g.html}</td>`).join('');
}

// Construit la grille (kind = 'F' formateur, 'T' testeur)
function gridHTML(state, days, kind) {
  const slots = daySlots(state.params);
  const { rows, theoryTesters } = app.schedule;
  const openSet = new Set(state.openDays);
  const theoryEnd = state.params.theoryTime + state.params.theoryDuration;

  const head = `<tr><th class="day-col">Jour</th><th class="who-col">Intervenant</th>${slots.map((t) => `<th>${fmtTime(t)}</th>`).join('')}</tr>`;

  const body = days.map((date) => {
    const inPeriod = date >= state.params.periodStart && date <= state.params.periodEnd;
    const open = openSet.has(date);
    const holiday = (state.params.holidays || []).some((h) => (h.date || h) === date);
    const assign = state.dayAssignments[date] || {};
    const assignedId = kind === 'F' ? assign.formateur : assign.testeur;

    // Intervenant du jour : affectation manuelle, sinon déduit de l'activité (auto)
    let who;
    let idsDuJour = new Set();
    if (!open || !inPeriod) who = '—';
    else if (assignedId) {
      idsDuJour = new Set([assignedId]);
      who = esc(memberName(state, assignedId));
    } else {
      const autoIds = new Set();
      for (const r of rows) {
        if (r.cancelled) continue;
        if (kind === 'F' && r.insc.datePratique === date && r.formateurEffectif) autoIds.add(r.formateurEffectif);
        if (kind === 'T' && r.insc.dateTestPratique === date && r.testeurEffectif) autoIds.add(r.testeurEffectif);
        if (kind === 'T' && r.formation?.testOnly && r.insc.datePratique === date && r.testeurEffectif) autoIds.add(r.testeurEffectif);
      }
      if (kind === 'T' && theoryTesters.get(date)) autoIds.add(theoryTesters.get(date));
      idsDuJour = autoIds;
      who = autoIds.size
        ? [...autoIds].map((id) => esc(memberName(state, id))).join(', ') + ' <span class="muted">(auto)</span>'
        : '<span class="who-missing">⚠ à affecter</span>';
    }

    // La colonne « Intervenant » dit déjà qui tient la journée : le répéter
    // dans chaque cellule allongeait les lignes sans rien apprendre. On ne
    // nomme donc l'intervenant dans une cellule que s'il s'y ajoute une
    // information : plusieurs intervenants ce jour-là, quelqu'un d'autre que
    // celui de la colonne, ou personne d'affecté — cas qui doit se voir.
    const nommerDansLaCellule = (id) => !(id && idsDuJour.size === 1 && idsDuJour.has(id));
    const detailQui = (prefixe, id) => (nommerDansLaCellule(id)
      ? `<span class="slot-detail">${prefixe}${esc(memberName(state, id) || '⚠ à affecter')}</span>`
      : '');

    const cells = fusionner(slots.map((t) => {
      if (!inPeriod) return { cle: 'hors', cls: 'slot-closed', html: '—' };
      if (isWeekend(date) || holiday) return { cle: 'ferie', cls: 'slot-closed', html: 'FÉRIÉ' };
      if (!open) return { cle: 'ferme', cls: 'slot-closed', html: 'FERMÉ' };
      const slotEnd = t + state.params.slotMinutes;

      // Théorie (grille testeur uniquement)
      if (kind === 'T' && theoryTesters.has(date)
        && t < theoryEnd && slotEnd > state.params.theoryTime) {
        const n = app.schedule.theoryCandidates(date);
        return {
          cle: 'theorie-test',
          cls: 'slot-theory',
          html: `<span class="slot-name">THÉORIE (${n} cand.)</span>${detailQui('Testeur : ', theoryTesters.get(date))}`,
        };
      }

      // Sessions de théorie présentielle (grille formateur)
      if (kind === 'F') {
        const sess = (app.schedule.theorySessions || []).filter((s) => s.date === date && t < s.fin && slotEnd > s.debut);
        if (sess.length) {
          const label = sess.map((s) => {
            const duree = s.type === 'Initial' ? '7h00' : '3h30';
            const nom = nommerDansLaCellule(s.formateurId)
              ? ` — Form. : ${esc(memberName(state, s.formateurId) || '⚠ à affecter')}` : '';
            return `<span class="slot-name">THÉORIE ${esc(s.reco)} (${s.stagiaires.length})</span>`
              + `<span class="slot-detail">${duree}${nom}</span>`;
          }).join('');
          const tip = sess.map((s) => `Théorie ${s.reco} ${s.type} — ${s.stagiaires.join(', ')}`).join(' | ');
          return {
            cle: `theorie-pres:${sess.map((s) => `${s.reco}@${s.debut}`).join('+')}`,
            cls: 'slot-theory',
            attrs: ` title="${esc(tip)}"`,
            html: label,
          };
        }
      }

      // Occupations. Les formations « épreuve seule » (AIPR) occupent la
      // grille TESTEUR sur leur créneau (champs Pratique), jamais la grille
      // FORMATEUR.
      const occupants = rows.filter((r) => {
        if (r.cancelled) return false;
        const i = r.insc;
        if (kind === 'F') {
          return !r.formation?.testOnly && i.datePratique === date && i.debutPratique != null
            && i.debutPratique < slotEnd && r.finPratique > t;
        }
        if (r.formation?.testOnly) {
          return i.datePratique === date && i.debutPratique != null
            && i.debutPratique < slotEnd && r.finPratique > t;
        }
        return i.dateTestPratique === date && i.debutTestPratique != null
          && i.debutTestPratique < slotEnd && r.finTestPratique > t;
      });

      if (occupants.length) {
        const tLabel = (r) => r.formation?.testOnly ? (r.formation?.label || '') : 'Test ' + (r.formation?.label?.replace('Pratique ', '') || '');
        const qui = (r) => (kind === 'F'
          ? detailQui('Form. : ', r.formateurEffectif)
          : detailQui(r.formation?.testOnly ? 'Surv. : ' : 'Testeur : ', r.testeurEffectif));
        // Chaque inscription porte son propre point d'entrée. Auparavant seule
        // la cellule était cliquable, et seulement quand elle ne contenait
        // qu'une inscription : une séance à deux stagiaires n'était donc pas
        // modifiable depuis la grille — le formulaire n'en éditant qu'une, le
        // code préférait ne rien poser plutôt que de choisir à l'aveugle. Il
        // suffisait de laisser choisir : une porte par ligne.
        const entree = (r) => `${r.insc.stagiaire} — ${r.formation?.label || ''}`
          + `${r.insc.statut === 'pre' ? ' (pré-réservé)' : ''}\nCliquer pour modifier`;
        const label = occupants.map((r) => `<div class="cell-entry${r.formation?.testOnly ? ' cell-entry-exam' : ''}"`
          + ` data-insc="${r.insc.id}" tabindex="0" role="button" title="${esc(entree(r))}"`
          + ` aria-label="Modifier l’inscription de ${esc(r.insc.stagiaire)}">`
          + `<span class="slot-name">${esc(r.insc.stagiaire)}</span>`
          + `<span class="slot-detail">${esc(kind === 'F' ? (r.formation?.label || '') : tLabel(r))}</span>`
          + `${qui(r)}</div>`).join('');
        // Épreuves surveillées (AIPR) : couleur dédiée — cellule entière si tout
        // est épreuve, sinon pastille violette sur les seules entrées AIPR
        const cls = occupants.every((r) => r.formation?.testOnly) ? 'slot-exam slot-busy' : 'slot-busy';
        const pre = occupants.every((r) => r.insc.statut === 'pre') ? ' slot-pre' : '';
        // L'intervenant entre toujours dans l'infobulle : la cellule ne le
        // nomme plus quand il tient toute la journée, mais le survol doit
        // répondre sans faire relire la colonne de gauche.
        const tip = occupants.map((r) => `${r.insc.stagiaire} — ${r.formation?.label || ''}`
          + `${r.formation?.testOnly ? ' (surveillance)' : ''}${r.insc.statut === 'pre' ? ' (pré-réservé)' : ''}`
          + ` — ${memberName(state, kind === 'F' ? r.formateurEffectif : r.testeurEffectif) || 'à affecter'}`).join(' | ');
        return {
          // Mêmes occupants, créneaux voisins : une seule cellule. Le libellé
          // s'écrit une fois pour toute la durée de la séance.
          cle: `occ:${occupants.map((r) => r.insc.id).join('+')}:${cls}${pre}`,
          cls: `${cls}${pre}`,
          attrs: ` title="${esc(tip)}"`,
          html: label,
        };
      }

      // Pause déjeuner : peinte seulement sur les créneaux restés libres — une
      // séance déjà posée dessus reste visible, son anomalie la signale.
      if (chevauchePause(state.params, t, slotEnd)) {
        return { cle: 'pause', cls: 'slot-pause', attrs: ' title="Pause déjeuner"', html: 'PAUSE' };
      }

      // Jamais fusionné : chaque créneau libre est cliquable à son heure.
      return {
        cle: null,
        cls: 'slot-free',
        attrs: ` data-date="${date}" data-time="${t}" data-kind="${kind}" tabindex="0" role="button"`
          + ` aria-label="Créneau libre ${fmtDateDay(date)} ${fmtTime(t)}"`,
        html: '',
      };
    }));

    // Charge de formation pratique du jour, PAR formateur — en temps de
    // séance (union des intervalles : 2 stagiaires simultanés = 1 séance).
    // Le plafond maxDailyLoad s'applique par formateur.
    let loadInfo = '';
    if (kind === 'F' && open && inPeriod) {
      const intervalsByTrainer = new Map();
      for (const r of rows) {
        if (r.cancelled || !chargeComptee(r.formation)) continue;
        if (r.insc.datePratique !== date || r.insc.debutPratique == null) continue;
        const key = r.formateurEffectif || '?';
        if (!intervalsByTrainer.has(key)) intervalsByTrainer.set(key, []);
        intervalsByTrainer.get(key).push({ start: r.insc.debutPratique, end: r.finPratique });
      }
      const byTrainer = new Map([...intervalsByTrainer.entries()].map(([id, list]) => [id, unionDuration(list)]));
      if (byTrainer.size) {
        const maxLabel = fmtTime(state.params.maxDailyLoad).replace(':', 'h');
        const parts = [...byTrainer.entries()].map(([id, load]) => {
          const over = load > state.params.maxDailyLoad;
          const name = id === '?' ? '?' : esc(memberName(state, id).split(' ')[0] || id);
          return `<span style="color:${over ? 'var(--error)' : 'var(--muted-foreground)'}" title="Charge de pratique de ${name} : ${fmtTime(load).replace(':', 'h')} (max ${maxLabel}/formateur)">${name} ${fmtTime(load).replace(':', 'h')}${over ? ' ⚠' : ''}</span>`;
        });
        loadInfo = `<br><span style="font-weight:400;font-size:10px">${parts.join(' · ')} <span style="color:var(--muted-foreground)">/ ${maxLabel}</span></span>`;
      }
    }
    return `<tr><td class="day-col">${fmtDateDay(date)}${loadInfo}</td><td class="who-col">${who}</td>${cells}</tr>`;
  }).join('');

  // Les deux grilles ont le même nombre de créneaux, donc la même largeur
  // minimale, donc les mêmes heures aux mêmes abscisses — l'une sous l'autre.
  const largeurMin = largeurMinGrille(slots.length, { intervenant: true });
  return `<table class="planning" style="min-width:${largeurMin}px">${head}${body}</table>`;
}
