// Moteur de planification : calcule pour chaque inscription les horaires dérivés,
// les intervenants effectifs (affectation automatique) et les contrôles (STATUT).
// Reproduit les règles du classeur "Planification EFI v4.2".

import { formationByCode, dureeFor, dureeTheorieFor, chargeComptee, pauseCreneau, chevauchePause } from './config.js';
import { isoWeek, overlaps, workingDays, joursOuvrables, bornesDuMois, fenetreAffichage, addDays, fmtTime, mondayOf, dateDuJour, isWeekend, semainesAffichees } from './dates.js';

// ---------------------------------------------------------------------------
// Calcul principal : retourne un tableau de "lignes calculées" alignées sur
// state.inscriptions, plus des index utiles aux vues.
// ---------------------------------------------------------------------------
export function computeSchedule(state) {
  const { params, formations, team, inscriptions } = state;
  const openDays = new Set(state.openDays);
  // Un jour tenable est un jour OUVRABLE — ni week-end, ni férié. La fenêtre
  // d'affichage n'entre pas dans ce jugement : une séance de la semaine
  // dernière est passée, pas anormale.
  const feries = new Set((params.holidays || []).map((h) => h.date || h));
  const ouvrable = (d) => !isWeekend(d) && !feries.has(d);
  const theoryEnd = params.theoryTime + params.theoryDuration;

  const rows = inscriptions.map((insc) => {
    const formation = formationByCode(formations, insc.formation);
    const duree = dureeFor(formation, insc.type);
    const dureeTheorieF = dureeTheorieFor(insc);
    return {
      insc,
      formation,
      duree,
      cancelled: insc.statut === 'annulee',
      finPratique: insc.debutPratique != null ? insc.debutPratique + duree : null,
      finTestPratique: insc.debutTestPratique != null ? insc.debutTestPratique + params.practicalTestDuration : null,
      heureTheorie: insc.dateTheorie ? params.theoryTime : null,
      // Théorie de la formation (modes centre / présentiel)
      dureeTheorieFormation: dureeTheorieF,
      finTheorieFormation: insc.debutTheorieFormation != null && dureeTheorieF ? insc.debutTheorieFormation + dureeTheorieF : null,
      semaine: insc.datePratique ? isoWeek(insc.datePratique) : null,
      formateurEffectif: null,
      testeurEffectif: null,
      testeurTheorie: null,
      formateurTheorieEffectif: null,
      errors: [],
    };
  });

  // --- Théorie : jours où au moins un candidat a un test théorique ---
  const active = rows.filter((r) => !r.cancelled);
  const theoryDays = new Set(active.filter((r) => r.insc.dateTheorie).map((r) => r.insc.dateTheorie));

  // --- Affectation automatique -------------------------------------------
  // busy[personId] = liste d'intervalles { date, start, end, kind, formation, inscId }
  const busy = new Map();
  for (const m of team) busy.set(m.id, []);

  const addBusy = (personId, interval) => {
    if (personId && busy.has(personId)) busy.get(personId).push(interval);
  };

  const isFree = (personId, date, start, end) => {
    const list = busy.get(personId) || [];
    return !list.some((b) => b.date === date && overlaps(b.start, b.end, start, end));
  };

  // Un formateur peut encadrer 2 candidats simultanés sur la MÊME formation si capacité ≥ 2
  const isFreeForTraining = (personId, date, start, end, formation) => {
    const list = busy.get(personId) || [];
    const conflicts = list.filter((b) => b.date === date && overlaps(b.start, b.end, start, end));
    if (!conflicts.length) return true;
    if (!formation || formation.capacite < 2) return false;
    const sameCat = conflicts.every((b) => b.kind === 'formation' && b.formation === formation.code);
    return sameCat && conflicts.length < formation.capacite;
  };

  const qualified = (personId, code, kind /* 'F' | 'T' */) => {
    const m = team.find((t) => t.id === personId);
    return !!m?.quals?.[code]?.[kind];
  };

  // Présence du jour (page Jours EFI) : clé absente ou liste vide = tous présents
  const presentOn = (personId, date) => {
    const p = state.dayPresence?.[date];
    return !p || !p.length || p.includes(personId);
  };

  const dayAssign = (date) => state.dayAssignments[date] || {};

  // avoid = intervenant à éviter (formateur du candidat) : on ne le retient
  // que si personne d'autre n'est disponible.
  const pickPerson = (date, code, kind, freeFn, avoid = null) => {
    const preferred = kind === 'F' ? dayAssign(date).formateur : dayAssign(date).testeur;
    const candidates = [];
    if (preferred) candidates.push(preferred);
    for (const m of team) if (!candidates.includes(m.id)) candidates.push(m.id);
    let fallback = null;
    for (const id of candidates) {
      if (!qualified(id, code, kind) || !presentOn(id, date) || !freeFn(id)) continue;
      if (avoid && id === avoid) { fallback = fallback || id; continue; }
      return id;
    }
    return fallback;
  };

  // Passe 1 — formateurs effectifs (l'affectation du testeur et de la théorie
  // évite ensuite le formateur du candidat)
  for (const row of rows) {
    const { insc, formation } = row;
    if (row.cancelled || !formation || formation.testOnly || !insc.datePratique || insc.debutPratique == null) continue;
    const { datePratique: date, debutPratique: start } = insc;
    const end = row.finPratique;
    if (insc.formateurId) {
      row.formateurEffectif = insc.formateurId;
    } else {
      row.formateurEffectif = pickPerson(date, formation.code, 'F',
        (id) => isFreeForTraining(id, date, start, end, formation));
      if (!row.formateurEffectif) row.errors.push('Aucun formateur disponible');
    }
    addBusy(row.formateurEffectif, { date, start, end, kind: 'formation', formation: formation.code, inscId: insc.id });
  }

  // Passe 1 bis — formations « épreuve seule » (ex. AIPR : la formation se
  // fait à distance) : le créneau saisi est une épreuve SURVEILLÉE par un
  // testeur. La surveillance ne mobilise pas son temps (0 en charge) : il
  // reste disponible pour toute autre action, on l'identifie simplement.
  for (const row of rows) {
    const { insc, formation } = row;
    if (row.cancelled || !formation?.testOnly || !insc.datePratique || insc.debutPratique == null) continue;
    const { datePratique: date } = insc;
    if (insc.testeurId) {
      row.testeurEffectif = insc.testeurId;
    } else {
      row.testeurEffectif = pickPerson(date, formation.code, 'T', () => true);
      if (!row.testeurEffectif) row.errors.push('Aucun testeur disponible');
    }
    // Pas d'addBusy : le superviseur n'est pas bloqué par l'épreuve.
  }

  // Passe 1 ter — sessions de théorie PRÉSENTIELLE (inter, mutualisées par
  // recommandation) : les lignes de la même recommandation saisies sur le
  // même créneau forment une session commune, animée par UN formateur.
  const theorySessions = [];
  {
    const byKey = new Map();
    for (const row of active) {
      const i = row.insc;
      if (i.modeTheorie !== 'presentiel' || !i.dateTheorieFormation || i.debutTheorieFormation == null || !row.formation) continue;
      const key = `${row.formation.reco}|${i.dateTheorieFormation}|${i.debutTheorieFormation}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(row);
    }
    for (const [key, group] of byKey) {
      const [reco, date, debutStr] = key.split('|');
      const debut = Number(debutStr);
      const fin = debut + group[0].dureeTheorieFormation;
      // Une session est d'un seul type (7h initiale / 3h30 recyclage)
      const types = new Set(group.map((r) => r.insc.type));
      if (types.size > 1) {
        for (const r of group) r.errors.push(`Session théorie ${reco} : initiale (7h00) et recyclage (3h30) mélangés sur le même créneau`);
      }
      const explicit = group.map((r) => r.insc.formateurTheorieId).find(Boolean) || null;
      let formateur = explicit;
      if (!formateur) {
        formateur = pickPerson(date, group[0].formation.code, 'F', (id) => isFree(id, date, debut, fin));
        if (!formateur) for (const r of group) r.errors.push('Aucun formateur disponible (théorie présentielle)');
      }
      for (const r of group) r.formateurTheorieEffectif = formateur;
      addBusy(formateur, { date, start: debut, end: fin, kind: 'theorie-formation' });
      theorySessions.push({
        reco, date, debut, fin, type: group[0].insc.type, formateurId: formateur,
        stagiaires: [...new Set(group.map((r) => r.insc.stagiaire))],
        rows: group,
      });
    }
  }

  // Passe 2 — théorie : testeur du jour (auto si non affecté), en évitant les
  // formateurs des candidats du jour. Bloque le créneau théorie.
  const theoryTesters = new Map(); // date -> personId|null
  for (const date of theoryDays) {
    let tester = dayAssign(date).testeur || null;
    if (!tester) {
      const candidatesRows = active.filter((r) => r.insc.dateTheorie === date && r.formation?.tests);
      const codes = candidatesRows.map((r) => r.formation.code);
      const trainerIds = new Set(candidatesRows.map((r) => r.formateurEffectif).filter(Boolean));
      const okFor = (m) => presentOn(m.id, date) && (codes.length ? codes.some((c) => qualified(m.id, c, 'T'))
        : Object.values(m.quals || {}).some((q) => q.T));
      tester = team.find((m) => okFor(m) && !trainerIds.has(m.id))?.id
        || team.find(okFor)?.id
        || null;
    }
    theoryTesters.set(date, tester);
    addBusy(tester, { date, start: params.theoryTime, end: theoryEnd, kind: 'theorie' });
  }

  // Passe 3 — testeurs effectifs des tests pratiques (ordre des inscriptions)
  for (const row of rows) {
    const { insc, formation } = row;
    if (row.cancelled || !formation) continue;

    if (insc.dateTestPratique && insc.debutTestPratique != null && formation.tests) {
      const { dateTestPratique: date, debutTestPratique: start } = insc;
      const end = row.finTestPratique;
      if (insc.testeurId) {
        row.testeurEffectif = insc.testeurId;
      } else {
        row.testeurEffectif = pickPerson(date, formation.code, 'T',
          (id) => isFree(id, date, start, end), row.formateurEffectif);
        if (!row.testeurEffectif) row.errors.push('Aucun testeur disponible');
      }
      addBusy(row.testeurEffectif, { date, start, end, kind: 'test', formation: formation.code, inscId: insc.id });
    }

    if (insc.dateTheorie) {
      row.testeurTheorie = theoryTesters.get(insc.dateTheorie) || null;
    }
  }

  // --- Contrôles ----------------------------------------------------------
  validateRows(active, { state, params, openDays, ouvrable, theoryDays, theoryTesters, qualified, presentOn, theorySessions });

  return {
    rows,
    theoryDays,
    theoryTesters,
    theorySessions,
    // Nombre de candidats au test théorique du jour (stagiaires uniques)
    theoryCandidates: (date) => new Set(
      rows.filter((r) => !r.cancelled && r.insc.dateTheorie === date).map((r) => r.insc.stagiaire.toLowerCase())
    ).size,
  };
}

// ---------------------------------------------------------------------------
// Contrôles automatiques — colonne STATUT
// ---------------------------------------------------------------------------
function validateRows(rows, ctx) {
  const { state, params, openDays, ouvrable, theoryTesters, qualified, presentOn, theorySessions = [] } = ctx;
  const theoryEnd = params.theoryTime + params.theoryDuration;
  const pratiqueLabel = (row) => (row.formation?.testOnly ? 'Épreuve' : 'Pratique');
  const memberNameOf = (st, id) => st.team.find((m) => m.id === id)?.name || id;

  const checkDay = (row, date, label) => {
    if (!date) return;
    if (!ouvrable(date)) row.errors.push(`${label} : week-end ou jour férié`);
    else if (!openDays.has(date)) row.errors.push(`${label} : jour non ouvert (EFI)`);
  };

  // enjambePause : réservé à la théorie présentielle, seule séance qui ne
  // tient pas dans une demi-journée (voir pauseCreneau dans config.js).
  const checkWindow = (row, start, end, label, enjambePause = false) => {
    if (start == null) return;
    if (start < params.dayStart || end > params.dayEnd) {
      row.errors.push(`${label} : hors plage ${fmtTime(params.dayStart)}–${fmtTime(params.dayEnd)}`);
    }
    if (start % params.slotMinutes !== 0) {
      row.errors.push(`${label} : début non aligné sur un créneau de ${params.slotMinutes} min`);
    }
    if (!enjambePause && chevauchePause(params, start, end)) {
      const p = pauseCreneau(params);
      row.errors.push(`${label} : chevauche la pause déjeuner (${fmtTime(p.debut)}–${fmtTime(p.fin)})`);
    }
  };

  // Théorie commune par stagiaire × recommandation
  const theoryByStagiaireReco = new Map();
  for (const r of rows) {
    if (r.insc.dateTheorie && r.formation) {
      theoryByStagiaireReco.set(`${r.insc.stagiaire.toLowerCase()}|${r.formation.reco}`, r.insc.dateTheorie);
    }
  }

  for (const row of rows) {
    const { insc, formation } = row;

    if (!insc.stagiaire) row.errors.push('Nom du stagiaire manquant');
    if (!formation) { row.errors.push('Formation non renseignée'); continue; }

    // Jours ouverts + plages horaires
    checkDay(row, insc.datePratique, pratiqueLabel(row));
    checkDay(row, insc.dateTheorie, 'Théorie');
    checkDay(row, insc.dateTestPratique, 'Test pratique');
    checkWindow(row, insc.debutPratique, row.finPratique, pratiqueLabel(row));
    checkWindow(row, insc.debutTestPratique, row.finTestPratique, 'Test pratique');

    if (insc.datePratique && insc.debutPratique == null) row.errors.push(`Heure de début de ${formation.testOnly ? 'l’épreuve' : 'pratique'} manquante`);
    if (!insc.datePratique) row.errors.push(`Date de ${formation.testOnly ? 'l’épreuve' : 'pratique'} manquante`);

    // Tests obligatoires (R489 / R486)
    if (formation.tests) {
      if (!insc.dateTestPratique || insc.debutTestPratique == null) {
        row.errors.push('Test pratique manquant');
      }
      const key = `${insc.stagiaire.toLowerCase()}|${formation.reco}`;
      if (!theoryByStagiaireReco.has(key)) {
        row.errors.push(`Test théorique ${formation.reco} manquant`);
      }
    }

    // Habilitations des intervenants effectifs
    if (row.formateurEffectif && !qualified(row.formateurEffectif, formation.code, 'F')) {
      row.errors.push('Formateur non habilité');
    }
    if (row.testeurEffectif && !qualified(row.testeurEffectif, formation.code, 'T')) {
      row.errors.push('Testeur non habilité');
    }
    if (row.testeurTheorie && !qualified(row.testeurTheorie, formation.code, 'T')) {
      row.errors.push('Testeur théorie non habilité');
    }

    // Formateur ≠ testeur du même candidat
    if (row.formateurEffectif) {
      if (row.testeurEffectif && row.formateurEffectif === row.testeurEffectif) {
        row.errors.push('Formateur = testeur du candidat (test pratique)');
      }
      if (row.testeurTheorie && row.formateurEffectif === row.testeurTheorie) {
        row.errors.push('Formateur = testeur du candidat (théorie)');
      }
    }

    // Présence du jour (page Jours EFI) : un intervenant positionné un jour
    // où il n'est pas coché présent est signalé
    const checkPresence = (id, date, label) => {
      if (id && date && !presentOn(id, date)) {
        row.errors.push(`${memberNameOf(state, id)} non présent ce jour (${label})`);
      }
    };
    if (formation.testOnly) {
      checkPresence(row.testeurEffectif, insc.datePratique, 'épreuve');
    } else {
      checkPresence(row.formateurEffectif, insc.datePratique, 'pratique');
      checkPresence(row.testeurEffectif, insc.dateTestPratique, 'test pratique');
    }
    checkPresence(row.testeurTheorie, insc.dateTheorie, 'théorie');
    checkPresence(row.formateurTheorieEffectif, insc.dateTheorieFormation, 'théorie présentielle');

    // Théorie de la formation (modes centre / présentiel)
    if (insc.modeTheorie && insc.modeTheorie !== 'distance') {
      const label = insc.modeTheorie === 'presentiel' ? 'Théorie présentielle' : 'Théorie en centre';
      if (!insc.dateTheorieFormation) row.errors.push(`${label} : date manquante`);
      else checkDay(row, insc.dateTheorieFormation, label);
      if (insc.dateTheorieFormation && insc.debutTheorieFormation == null) row.errors.push(`${label} : heure manquante`);
      checkWindow(row, insc.debutTheorieFormation, row.finTheorieFormation, label,
        insc.modeTheorie === 'presentiel');
      if (insc.modeTheorie === 'presentiel' && row.formateurTheorieEffectif
        && !qualified(row.formateurTheorieEffectif, formation.code, 'F')) {
        row.errors.push('Formateur théorie non habilité');
      }
    }
  }

  // --- Conflits croisés entre lignes ---
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      crossChecks(rows[i], rows[j], params);
    }
  }

  // Créneaux « testeur » d'une ligne : test pratique classique uniquement.
  // Les épreuves « test seul » (AIPR) sont de la SURVEILLANCE : elles ne
  // mobilisent pas le temps du testeur et n'entrent dans aucun conflit.
  const testerSlots = (r) => {
    const out = [];
    if (r.insc.dateTestPratique && r.insc.debutTestPratique != null) {
      out.push({ date: r.insc.dateTestPratique, start: r.insc.debutTestPratique, end: r.finTestPratique });
    }
    return out;
  };

  // Un même intervenant ne peut pas former et faire passer un test en même temps
  for (const a of rows) {
    if (a.formation?.testOnly) continue;
    if (!a.insc.datePratique || a.insc.debutPratique == null || !a.formateurEffectif) continue;
    for (const b of rows) {
      if (b.testeurEffectif !== a.formateurEffectif) continue;
      for (const s of testerSlots(b)) {
        if (s.date !== a.insc.datePratique) continue;
        if (overlaps(a.insc.debutPratique, a.finPratique, s.start, s.end)) {
          const msg = 'Intervenant en formation et en test en même temps';
          if (!a.errors.includes(msg)) a.errors.push(msg);
          if (!b.errors.includes(msg)) b.errors.push(msg);
        }
      }
    }
    // … ni former pendant le créneau théorie qu'il anime
    const tt = theoryTesters.get(a.insc.datePratique);
    if (tt && tt === a.formateurEffectif
      && overlaps(a.insc.debutPratique, a.finPratique, params.theoryTime, theoryEnd)) {
      const msg = 'Intervenant en formation pendant la théorie qu’il anime';
      if (!a.errors.includes(msg)) a.errors.push(msg);
    }
  }

  // Test pratique (ou épreuve) pendant le créneau théorie du MÊME testeur
  for (const row of rows) {
    for (const s of testerSlots(row)) {
      const theoryTester = theoryTesters.get(s.date);
      if (theoryTester && row.testeurEffectif === theoryTester
        && overlaps(s.start, s.end, params.theoryTime, theoryEnd)) {
        const msg = 'Test pratique pendant le créneau théorie';
        if (!row.errors.includes(msg)) row.errors.push(msg);
      }
    }
  }

  // Dépassement de la capacité simultanée (ex. 3 candidats sur 2 chariots R489 Cat 3)
  for (const row of rows) {
    const { insc, formation } = row;
    if (!formation || (formation.capacite || 1) < 2) continue;
    if (!insc.datePratique || insc.debutPratique == null || !row.formateurEffectif) continue;
    const simultaneous = rows.filter((r) =>
      r.formation?.code === formation.code
      && r.formateurEffectif === row.formateurEffectif
      && r.insc.datePratique === insc.datePratique
      && r.insc.debutPratique != null
      && overlapsRow(r, row));
    if (simultaneous.length > formation.capacite) {
      const msg = `Formateur : ${simultaneous.length} candidats simultanés en ${formation.label} (capacité ${formation.capacite})`;
      if (!row.errors.includes(msg)) row.errors.push(msg);
    }
  }

  // Théorie renseignée en double pour un même stagiaire × recommandation
  const theoryLines = new Map();
  for (const r of rows) {
    if (!r.insc.dateTheorie || !r.formation) continue;
    const key = `${r.insc.stagiaire.toLowerCase()}|${r.formation.reco}`;
    theoryLines.set(key, (theoryLines.get(key) || 0) + 1);
  }
  for (const r of rows) {
    if (!r.insc.dateTheorie || !r.formation) continue;
    const key = `${r.insc.stagiaire.toLowerCase()}|${r.formation.reco}`;
    if (theoryLines.get(key) > 1) {
      r.errors.push(`Théorie ${r.formation.reco} renseignée sur plusieurs lignes (une seule suffit)`);
    }
  }

  // Charge : formation pratique ≤ max / jour / formateur effectif —
  // calculée en TEMPS DE SÉANCE du formateur (union de ses intervalles) :
  // deux stagiaires simultanés (capacité ≥ 2) = une seule séance.
  // Les formations dont la charge n'est pas comptée (paramètre du catalogue,
  // ex. surveillance d'épreuve AIPR) sont exclues du plafond.
  const intervalsByDayTrainer = new Map();
  for (const row of rows) {
    if (!chargeComptee(row.formation)) continue;
    if (!row.insc.datePratique || row.insc.debutPratique == null) continue;
    const key = `${row.insc.datePratique}|${row.formateurEffectif || '?'}`;
    if (!intervalsByDayTrainer.has(key)) intervalsByDayTrainer.set(key, []);
    intervalsByDayTrainer.get(key).push({ start: row.insc.debutPratique, end: row.finPratique });
  }
  const loadByDayTrainer = new Map();
  for (const [key, list] of intervalsByDayTrainer) loadByDayTrainer.set(key, unionDuration(list));
  for (const row of rows) {
    if (!chargeComptee(row.formation)) continue;
    if (!row.insc.datePratique || row.insc.debutPratique == null) continue;
    const key = `${row.insc.datePratique}|${row.formateurEffectif || '?'}`;
    if (loadByDayTrainer.get(key) > params.maxDailyLoad) {
      row.errors.push(`Charge > ${fmtTime(params.maxDailyLoad).replace(':', 'h')} de pratique ce jour`);
    }
  }

  // Sessions de théorie présentielle : le formateur de session ne peut pas
  // être en pratique ou en test pendant sa session
  for (const s of theorySessions) {
    if (!s.formateurId) continue;
    for (const r of rows) {
      if (!r.formation?.testOnly && r.insc.datePratique === s.date && r.insc.debutPratique != null
        && r.formateurEffectif === s.formateurId
        && overlaps(r.insc.debutPratique, r.finPratique, s.debut, s.fin)) {
        const msg = 'Intervenant en théorie présentielle et en activité en même temps';
        if (!r.errors.includes(msg)) r.errors.push(msg);
        for (const g of s.rows) if (!g.errors.includes(msg)) g.errors.push(msg);
      }
      if (r.insc.dateTestPratique === s.date && r.insc.debutTestPratique != null
        && r.testeurEffectif === s.formateurId
        && overlaps(r.insc.debutTestPratique, r.finTestPratique, s.debut, s.fin)) {
        const msg = 'Intervenant en théorie présentielle et en test en même temps';
        if (!r.errors.includes(msg)) r.errors.push(msg);
        for (const g of s.rows) if (!g.errors.includes(msg)) g.errors.push(msg);
      }
    }
  }

  // Chevauchements du stagiaire avec sa propre théorie de formation
  // (les autres chevauchements stagiaire sont traités dans crossChecks)
  for (const row of rows) {
    const i = row.insc;
    if (!i.dateTheorieFormation || i.debutTheorieFormation == null || !row.finTheorieFormation) continue;
    const tf = { start: i.debutTheorieFormation, end: row.finTheorieFormation };
    if (i.datePratique === i.dateTheorieFormation && i.debutPratique != null
      && overlaps(i.debutPratique, row.finPratique, tf.start, tf.end)) {
      row.errors.push(`${row.formation?.testOnly ? 'Épreuve' : 'Pratique'} en même temps que la théorie de formation`);
    }
    if (i.dateTestPratique === i.dateTheorieFormation && i.debutTestPratique != null
      && overlaps(i.debutTestPratique, row.finTestPratique, tf.start, tf.end)) {
      row.errors.push('Test pratique en même temps que la théorie de formation');
    }
    if (i.dateTheorie === i.dateTheorieFormation
      && overlaps(params.theoryTime, theoryEnd, tf.start, tf.end)) {
      row.errors.push('Test théorique en même temps que la théorie de formation');
    }
  }

  // Capacité de la salle de théorie : présentiel + e-learning en centre
  {
    const cap = params.salleCapacite ?? 12;
    // Occupations de salle par date : { date, start, end, stagiaire, row }
    const roomUse = [];
    for (const s of theorySessions) {
      for (const r of s.rows) roomUse.push({ date: s.date, start: s.debut, end: s.fin, stagiaire: r.insc.stagiaire.toLowerCase(), row: r });
    }
    for (const r of rows) {
      const i = r.insc;
      if (i.modeTheorie === 'centre' && i.dateTheorieFormation && i.debutTheorieFormation != null && r.finTheorieFormation) {
        roomUse.push({ date: i.dateTheorieFormation, start: i.debutTheorieFormation, end: r.finTheorieFormation, stagiaire: i.stagiaire.toLowerCase(), row: r });
      }
    }
    const byDate = new Map();
    for (const u of roomUse) {
      if (!byDate.has(u.date)) byDate.set(u.date, []);
      byDate.get(u.date).push(u);
    }
    for (const [, uses] of byDate) {
      for (let t = params.dayStart; t < params.dayEnd; t += params.slotMinutes) {
        const concurrent = uses.filter((u) => overlaps(u.start, u.end, t, t + params.slotMinutes));
        const distinct = new Set(concurrent.map((u) => u.stagiaire));
        if (distinct.size > cap) {
          const msg = `Salle de théorie pleine : ${distinct.size} stagiaires simultanés (capacité ${cap})`;
          for (const u of concurrent) if (!u.row.errors.includes(msg)) u.row.errors.push(msg);
        }
      }
    }
  }

  // NB : pas de contrôle de cumul sur les épreuves « test seul » (AIPR) —
  // le superviseur peut surveiller plusieurs candidats à la fois et assurer
  // une autre action en parallèle.

  // Théorie du stagiaire vs ses propres créneaux (chevauchement même stagiaire) :
  // traité dans crossChecks + ci-dessous pour la théorie de la même ligne
  for (const row of rows) {
    const { insc } = row;
    if (!insc.dateTheorie) continue;
    const tStart = params.theoryTime;
    const tEnd = theoryEnd;
    if (insc.datePratique === insc.dateTheorie && insc.debutPratique != null
      && overlaps(insc.debutPratique, row.finPratique, tStart, tEnd)) {
      row.errors.push('Pratique en même temps que la théorie');
    }
    if (insc.dateTestPratique === insc.dateTheorie && insc.debutTestPratique != null
      && overlaps(insc.debutTestPratique, row.finTestPratique, tStart, tEnd)) {
      row.errors.push('Test pratique en même temps que la théorie');
    }
  }
}

function overlapsRow(a, b) {
  return overlaps(a.insc.debutPratique, a.finPratique, b.insc.debutPratique, b.finPratique);
}

function crossChecks(a, b, params) {
  const A = a.insc; const B = b.insc;

  // Même stagiaire : aucun chevauchement entre ses créneaux (pratiques, tests, théorie)
  if (A.stagiaire && A.stagiaire.toLowerCase() === B.stagiaire.toLowerCase()) {
    const slots = (r) => {
      const out = [];
      const i = r.insc;
      if (i.datePratique && i.debutPratique != null) out.push({ date: i.datePratique, start: i.debutPratique, end: r.finPratique, label: 'pratique' });
      if (i.dateTestPratique && i.debutTestPratique != null) out.push({ date: i.dateTestPratique, start: i.debutTestPratique, end: r.finTestPratique, label: 'test pratique' });
      if (i.dateTheorie) out.push({ date: i.dateTheorie, start: params.theoryTime, end: params.theoryTime + params.theoryDuration, label: 'théorie' });
      if (i.dateTheorieFormation && i.debutTheorieFormation != null && r.finTheorieFormation) {
        out.push({ date: i.dateTheorieFormation, start: i.debutTheorieFormation, end: r.finTheorieFormation, label: 'théorie formation' });
      }
      return out;
    };
    // Créneaux mutualisés par nature : test théorique commun, et session de
    // théorie de formation identique (même début) sur deux lignes du stagiaire
    const mutualised = (sa, sb) => (sa.label === 'théorie' && sb.label === 'théorie')
      || (sa.label === 'théorie formation' && sb.label === 'théorie formation' && sa.start === sb.start);
    for (const sa of slots(a)) {
      for (const sb of slots(b)) {
        if (sa.date === sb.date && overlaps(sa.start, sa.end, sb.start, sb.end)
          && !mutualised(sa, sb)) {
          const msg = `Chevauchement stagiaire (${sa.label} / ${sb.label} le ${sa.date})`;
          if (!a.errors.includes(msg)) a.errors.push(msg);
          if (!b.errors.includes(msg)) b.errors.push(msg);
        }
      }
    }
  }

  // Formateur : jamais 2 catégories différentes en même temps ; même catégorie
  // limitée à la capacité simultanée
  if (A.datePratique && A.datePratique === B.datePratique
    && A.debutPratique != null && B.debutPratique != null
    && a.formateurEffectif && a.formateurEffectif === b.formateurEffectif
    && overlaps(A.debutPratique, a.finPratique, B.debutPratique, b.finPratique)) {
    if (A.formation !== B.formation) {
      const msg = 'Formateur : 2 catégories en même temps';
      a.errors.push(msg); b.errors.push(msg);
    } else if ((a.formation?.capacite || 1) < 2) {
      const msg = `Formateur : 2 candidats simultanés en ${a.formation?.label || A.formation}`;
      a.errors.push(msg); b.errors.push(msg);
    }
    // capacité ≥ 2 : autorisé (le dépassement > capacité est contrôlé par comptage ci-dessous)
  }

  // Testeur : jamais 2 tests pratiques en même temps (sauf testeurs effectifs différents)
  if (A.dateTestPratique && A.dateTestPratique === B.dateTestPratique
    && A.debutTestPratique != null && B.debutTestPratique != null
    && a.testeurEffectif && a.testeurEffectif === b.testeurEffectif
    && overlaps(A.debutTestPratique, a.finTestPratique, B.debutTestPratique, b.finTestPratique)) {
    const msg = 'Testeur : 2 tests pratiques en même temps';
    a.errors.push(msg); b.errors.push(msg);
  }
}

export function statutOf(row) {
  return row.errors.length ? row.errors : null;
}

// Durée cumulée d'une union d'intervalles {start, end} : deux stagiaires
// simultanés (capacité ≥ 2) ne comptent qu'UNE séance de formateur.
export function unionDuration(intervals) {
  const sorted = intervals
    .filter((i) => i && i.start != null && i.end != null)
    .sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = null;
  let curEnd = null;
  for (const { start, end } of sorted) {
    if (curEnd == null || start > curEnd) {
      if (curEnd != null) total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    } else {
      curEnd = Math.max(curEnd, end);
    }
  }
  if (curEnd != null) total += curEnd - curStart;
  return total;
}

// Minutes réellement offertes dans une journée : la pause déjeuner, quand
// elle est active, sort du dénominateur — sinon le taux d'occupation
// plafonnerait mécaniquement sous 100 % sans que personne soit disponible.
export function minutesOffertes(params) {
  const p = pauseCreneau(params);
  const jour = params.dayEnd - params.dayStart;
  if (!p) return jour;
  const debut = Math.max(p.debut, params.dayStart);
  const fin = Math.min(p.fin, params.dayEnd);
  return jour - Math.max(0, fin - debut);
}

// ---------------------------------------------------------------------------
// Occupation par jour (heatmap) : créneaux réservés / créneaux offerts
// (2 ressources — formateur et testeur — × créneaux de la journée).
// ---------------------------------------------------------------------------
export function occupancyByDay(state, schedule) {
  const { params } = state;
  const slotsPerDay = Math.floor(minutesOffertes(params) / params.slotMinutes);
  const openSet = new Set(state.openDays);
  const out = new Map(); // date -> { busy, total, ratio, errors }

  const ensure = (date) => {
    if (!out.has(date)) {
      out.set(date, { busy: 0, total: openSet.has(date) ? slotsPerDay * 2 : 0, ratio: 0, errors: 0 });
    }
    return out.get(date);
  };

  for (const day of state.openDays) ensure(day);

  for (const r of schedule.rows) {
    if (r.cancelled) continue;
    const i = r.insc;
    // Une formation dont la charge n'est pas comptée (surveillance d'épreuve)
    // ne mobilise pas de temps d'intervenant : elle ne pèse pas dans l'occupation.
    if (i.datePratique && i.debutPratique != null && chargeComptee(r.formation)) {
      ensure(i.datePratique).busy += r.duree / params.slotMinutes;
    }
    if (i.dateTestPratique && i.debutTestPratique != null && r.formation?.tests) {
      ensure(i.dateTestPratique).busy += params.practicalTestDuration / params.slotMinutes;
    }
    if (r.errors.length && i.datePratique) ensure(i.datePratique).errors += 1;
  }
  // Théorie : un créneau testeur par jour concerné
  for (const [date] of schedule.theoryTesters) {
    if (schedule.theoryCandidates(date) > 0) {
      ensure(date).busy += state.params.theoryDuration / params.slotMinutes;
    }
  }
  // Sessions de théorie présentielle : un formateur mobilisé par session
  for (const s of schedule.theorySessions || []) {
    ensure(s.date).busy += (s.fin - s.debut) / params.slotMinutes;
  }

  for (const v of out.values()) {
    v.ratio = v.total ? v.busy / v.total : 0;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Occupation agrégée (carte KPI du tableau de bord) sur une portée au choix :
// 'periode' (tous les jours ouverts), 'semaine' ou 'mois' en cours. La date de
// référence est ramenée dans la période si on est avant/après (utile avant le
// démarrage : la « semaine en cours » est alors la première de la période).
// Même convention que la carte historique : capacité = créneaux d'une journée
// × jours ouverts de la portée, réservations = pratiques + tests pratiques.
// ---------------------------------------------------------------------------
export const OCCUPATION_SCOPES = ['periode', 'semaine', 'mois'];

// Fenêtre temporelle d'une portée : prédicat d'appartenance, jours ouvrables
// et jours ouverts qu'elle contient. Sert à toutes les cartes du tableau de
// bord (le même choix de portée gouverne l'ensemble des indicateurs).
export function scopeWindow(state, scope = 'periode', todayISO = null) {
  const { params } = state;
  // Heures locales du centre, jamais l'UTC : passé minuit à Paris, un « today »
  // déduit de toISOString rendrait la veille, et la portée « semaine » pourrait
  // basculer d'une semaine.
  //
  // Plus rien à ramener dans une période réglée à la main : chaque portée porte
  // ses propres bornes.
  const ref = todayISO || dateDuJour();

  // Chaque portée définit son intervalle — et non l'intersection avec la
  // fenêtre d'affichage : « le mois en cours » est le mois entier. Intersecté,
  // il ne comptait plus, le 15 septembre, que la seconde quinzaine, et la
  // carte d'occupation du mois s'effondrait à zéro.
  let debut;
  let fin;
  if (scope === 'semaine') {
    debut = mondayOf(ref);
    fin = addDays(debut, 6);
  } else if (scope === 'mois') {
    ({ debut, fin } = bornesDuMois(ref));
  } else {
    ({ debut, fin } = fenetreAffichage(ref));
  }
  const isIn = (d) => !!d && d >= debut && d <= fin;

  const working = joursOuvrables(params, debut, fin);
  const openDays = state.openDays.filter((d) => working.includes(d));
  return { scope, ref, debut, fin, isIn, workingCount: working.length, openDays };
}

// Une ligne appartient à la portée si l'une de ses activités (pratique ou
// test pratique) y a lieu. Sur la période complète, tout compte — y compris
// les inscriptions pas encore planifiées.
// Semaines qu'on peut ouvrir dans les grilles : la fenêtre d'affichage, plus
// celles qui portent déjà une séance.
//
// La fenêtre glisse et commence à la semaine en cours. Sans ce complément, une
// séance de la semaine dernière deviendrait inconsultable : le lien « S37 » de
// la liste des anomalies atterrirait sur une autre semaine, et il n'y aurait
// plus aucun moyen de relire ce qui s'est passé.
export function semainesConsultables(state, aujourdHui = dateDuJour()) {
  const par = new Map(semainesAffichees(aujourdHui).map((w) => [w.monday, w]));
  for (const i of state.inscriptions || []) {
    for (const d of [i.datePratique, i.dateTestPratique, i.dateTheorie, i.dateTheorieFormation]) {
      if (!d) continue;
      const monday = mondayOf(d);
      if (!par.has(monday)) par.set(monday, { week: isoWeek(monday), monday });
    }
  }
  return [...par.values()].sort((a, b) => (a.monday < b.monday ? -1 : 1));
}

export function rowInScope(row, win) {
  if (win.scope === 'periode') return true;
  return !!(row.insc.datePratique && win.isIn(row.insc.datePratique))
    || !!(row.insc.dateTestPratique && win.isIn(row.insc.dateTestPratique));
}

// « Prochaines activités » : les séances À VENIR, de la plus proche à la plus
// lointaine.
//
// Le tableau de bord prenait les premières lignes de la portée triées par
// date, sans plancher : sur la portée « période », il affichait donc les
// activités les plus ANCIENNES — septembre en décembre. Le titre promettait
// l'avenir, le contenu montrait un passé révolu, et rien ne bougeait d'un
// jour à l'autre.
//
// Les journées en cours comptent comme à venir : une séance de cet
// après-midi n'est pas du passé.
export function prochainesActivites(rows, { aujourdHui = dateDuJour(), max = 8 } = {}) {
  const datees = rows.filter((r) => r.insc.datePratique);
  const aVenir = datees.filter((r) => r.insc.datePratique >= aujourdHui);
  return {
    lignes: aVenir
      .sort((a, b) => a.insc.datePratique.localeCompare(b.insc.datePratique)
        || (a.insc.debutPratique ?? 0) - (b.insc.debutPratique ?? 0))
      .slice(0, max),
    // Distingue « rien de planifié » de « tout est passé » : les deux méritent
    // un message différent, et la seconde n'est pas une anomalie en fin de
    // période.
    passees: datees.length - aVenir.length,
  };
}

export function occupationSummary(state, schedule, scope = 'periode', todayISO = null) {
  const { params } = state;
  const win = scopeWindow(state, scope, todayISO);
  const ref = win.ref;

  const scopeDays = new Set(win.openDays);
  const slotsPerDay = minutesOffertes(params) / params.slotMinutes;
  const total = scopeDays.size * slotsPerDay;

  let busy = 0;
  for (const r of schedule.rows) {
    if (r.cancelled) continue;
    const i = r.insc;
    // Charge non comptée (surveillance d'épreuve) : 0 temps mobilisé
    if (i.datePratique && i.debutPratique != null && scopeDays.has(i.datePratique) && chargeComptee(r.formation)) {
      busy += r.duree / params.slotMinutes;
    }
    if (i.dateTestPratique && i.debutTestPratique != null && scopeDays.has(i.dateTestPratique)) {
      busy += params.practicalTestDuration / params.slotMinutes;
    }
  }
  // Sessions de théorie présentielle (un formateur mobilisé par session)
  for (const s of schedule.theorySessions || []) {
    if (scopeDays.has(s.date)) busy += (s.fin - s.debut) / params.slotMinutes;
  }

  return {
    scope,
    ref, // date de référence (le jour même) — pour le libellé
    days: scopeDays.size,
    pct: total ? Math.min(100, Math.round((busy / total) * 100)) : 0,
    hours: busy * params.slotMinutes / 60,
  };
}

// ---------------------------------------------------------------------------
// Enchaînement des séances
//
// Une proposition qui ne regarde que « le premier créneau libre » hache la
// journée des intervenants. Sur un parcours R489 1A + 3 + 5, l'outil posait
// formation, test, formation, test, formation, test : le formateur travaillait
// de 08:00 à 09:30, attendait deux heures et demie, reprenait à 12:00 — et le
// testeur de même, en alternance. Personne ne tenait un bloc continu.
//
// On préfère donc, à validité égale, un créneau qui COLLE à une séance du même
// genre déjà posée ce jour-là : les formations s'enchaînent entre elles, les
// tests pratiques entre eux. Ce n'est qu'une préférence d'ordre d'essai : la
// validité reste tranchée par le moteur, et l'indisponibilité d'un intervenant
// fait retomber sur un créneau non contigu plutôt que d'échouer.
//
// Genre 'formation' = ce qui mobilise un FORMATEUR ; genre 'test' = ce qui
// mobilise un TESTEUR, épreuves surveillées (AIPR) comprises : c'est la
// journée de l'intervenant qu'on cherche à rendre continue, pas l'étiquette.
// ---------------------------------------------------------------------------
function ancrages(state, jour, genre, excludeId = null) {
  const fins = new Set();
  const debuts = new Set();
  for (const r of computeSchedule(state).rows) {
    if (r.cancelled) continue;
    const i = r.insc;
    if (excludeId != null && i.id === excludeId) continue;
    const epreuve = !!r.formation?.testOnly;
    // Le créneau « pratique » d'une épreuve seule est tenu par un testeur.
    if (i.datePratique === jour && i.debutPratique != null && (epreuve ? genre === 'test' : genre === 'formation')) {
      debuts.add(i.debutPratique);
      fins.add(r.finPratique);
    }
    if (genre === 'test' && i.dateTestPratique === jour && i.debutTestPratique != null) {
      debuts.add(i.debutTestPratique);
      fins.add(r.finTestPratique);
    }
  }
  return { fins, debuts };
}

// Créneaux réordonnés : ce qui prolonge une séance du même genre d'abord, ce
// qui la précède ensuite, le reste après.
//
// « apres » garde la préférence qui existait déjà pour le test pratique — le
// placer après la formation du même stagiaire plutôt qu'avant. Elle est
// exprimée ici comme un critère de tri, et non par l'ordre du tableau reçu :
// un tri stable sur un tableau préordonné perdait cette intention dès qu'un
// autre critère s'y ajoutait.
// « avant » passe en tête les créneaux qui laissent encore la place d'une
// séance de cette durée derrière eux, le même jour. Sans ce critère, coller la
// formation à la dernière séance de la journée la poussait en fin d'après-midi
// et son test pratique n'avait plus où tenir : l'outil proposait alors une
// formation à 15:30 et son test à 08:00, soit avant. L'enchaînement ne vaut
// qu'à l'intérieur de ce qui reste tenable.
function parEnchainement(creneaux, { fins, debuts }, duree, { apres = null, avant = null } = {}) {
  const rang = (t) => (fins.has(t) ? 0 : debuts.has(t + duree) ? 1 : 2);
  const tot = (t) => (apres == null || t >= apres ? 0 : 1);
  const place = (t) => (avant == null || t + duree + avant.duree <= avant.limite ? 0 : 1);
  return [...creneaux].sort((a, b) => place(a) - place(b) || rang(a) - rang(b) || tot(a) - tot(b) || a - b);
}

// ---------------------------------------------------------------------------
// Proposition automatique de créneaux : première combinaison
// pratique (+ test pratique + théorie si obligatoires) sans anomalie.
//
// « sansTest » ne pose que la pratique (et la théorie) en tolérant l'anomalie
// « test pratique manquant » : c'est la première passe d'un parcours, qui
// regroupe toutes les formations avant de placer les tests.
// ---------------------------------------------------------------------------
export function suggestSlots(state, { stagiaire, formation: code, type, aPartirDu = null, aujourdHui = dateDuJour(), sansTest = false }, excludeId = null) {
  const { params } = state;
  const formation = formationByCode(state.formations, code);
  if (!formation || !stagiaire) return null;
  const duree = dureeFor(formation, type);
  // La fenêtre d'affichage borne les propositions : on ne planifie pas dans le
  // passé, ni à plus de seize semaines. « aujourdHui » est un point d'entrée
  // pour les tests — sans lui ils dériveraient avec le calendrier réel.
  const openDays = workingDays(params, aujourdHui)
    .filter((d) => state.openDays.includes(d) && (!aPartirDu || d >= aPartirDu));
  const slots = [];
  for (let t = params.dayStart; t + params.slotMinutes <= params.dayEnd; t += params.slotMinutes) {
    if (chevauchePause(params, t, t + params.slotMinutes)) continue;
    slots.push(t);
  }

  // La théorie de la recommandation est-elle déjà planifiée pour ce stagiaire
  // (hors ligne en cours de replanification) ?
  const hasTheory = state.inscriptions.some((i) => {
    if (excludeId != null && i.id === excludeId) return false;
    const f = formationByCode(state.formations, i.formation);
    return i.stagiaire.toLowerCase() === stagiaire.toLowerCase() && f?.reco === formation.reco && i.dateTheorie;
  });

  // Anomalies préexistantes par ligne : une proposition ne doit pas en créer
  // de nouvelles sur les réservations déjà en place.
  const baseline = new Map();
  {
    const base = structuredClone(state);
    if (excludeId != null) base.inscriptions = base.inscriptions.filter((i) => i.id !== excludeId);
    for (const r of computeSchedule(base).rows) baseline.set(r.insc.id, r.errors.length);
  }

  const trial = (draft, ignorable = null) => {
    const sim = structuredClone(state);
    if (excludeId != null) sim.inscriptions = sim.inscriptions.filter((i) => i.id !== excludeId);
    sim.inscriptions.push({ id: sim.nextId++, ...draft });
    const { rows } = computeSchedule(sim);
    const newRow = rows.find((r) => r.insc.id === sim.nextId - 1);
    const ok = ignorable ? newRow.errors.every((e) => ignorable.test(e)) : newRow.errors.length === 0;
    if (!ok) return false;
    // Les autres lignes ne doivent pas se dégrader
    return rows.every((r) => r === newRow || r.errors.length <= (baseline.get(r.insc.id) ?? 0));
  };

  const IGNORE_MISSING_TESTS = /Test (pratique|théorique).*manquant/;
  const maxTrials = 2000;
  let trials = 0;

  // Le genre de la séance « pratique » : une épreuve seule (AIPR) mobilise un
  // testeur, pas un formateur — elle s'enchaîne donc avec les tests.
  const genrePratique = formation.testOnly ? 'test' : 'formation';

  for (const day of openDays) {
    // À validité égale, on prolonge ce qui est déjà posé ce jour-là plutôt que
    // d'ouvrir un trou dans la journée de l'intervenant.
    const creneauxPratique = parEnchainement(slots, ancrages(state, day, genrePratique, excludeId), duree,
      formation.tests ? { avant: { duree: params.practicalTestDuration, limite: params.dayEnd } } : {});
    for (const start of creneauxPratique) {
      if (start + duree > params.dayEnd) continue;
      const base = { stagiaire, formation: code, type, datePratique: day, debutPratique: start };
      if (++trials > maxTrials) return null;
      if (!formation.tests) {
        if (trial(base)) return base;
        continue;
      }
      const withTheory = { ...base, dateTheorie: hasTheory ? null : day };
      // Pré-vérification : la pratique seule doit passer (seuls les tests manquants sont tolérés)
      if (!trial(withTheory, IGNORE_MISSING_TESTS)) continue;
      if (sansTest) return withTheory;
      // Test pratique : même jour de préférence, sinon jours suivants. On
      // privilégie un créneau qui prolonge un autre test, puis — à défaut —
      // l'après-formation.
      for (const testDay of openDays.filter((d) => d >= day)) {
        // Le même jour, le test ne peut être QUE derrière la formation : on
        // n'évalue pas une pratique avant de l'avoir enseignée. Ce n'était
        // qu'une préférence, et elle cédait dès qu'aucun créneau ne restait
        // après — d'où une formation à 15:30 et son test à 08:00.
        const possibles = testDay === day ? slots.filter((t) => t >= start + duree) : slots;
        const ordered = parEnchainement(possibles, ancrages(state, testDay, 'test', excludeId),
          params.practicalTestDuration);
        for (const testStart of ordered) {
          if (testStart + params.practicalTestDuration > params.dayEnd) continue;
          const draft = { ...withTheory, dateTestPratique: testDay, debutTestPratique: testStart };
          if (++trials > maxTrials) return null;
          if (trial(draft)) return draft;
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Test pratique d'une ligne DÉJÀ posée.
//
// Seconde passe d'un parcours : les formations sont en place, on vient
// accrocher les tests les uns aux autres. suggestSlots ne sait pas faire —
// il pose une ligne neuve, pas un champ manquant sur une ligne existante.
// ---------------------------------------------------------------------------
export function suggestTestPratique(state, inscId, { aPartirDu = null, aujourdHui = dateDuJour() } = {}) {
  const { params } = state;
  const cible = state.inscriptions.find((i) => i.id === inscId);
  if (!cible) return null;
  const formation = formationByCode(state.formations, cible.formation);
  if (!formation?.tests) return null;
  const duree = dureeFor(formation, cible.type);

  const depuis = [cible.datePratique, aPartirDu, aujourdHui].filter(Boolean).sort().at(-1);
  const openDays = workingDays(params, aujourdHui)
    .filter((d) => state.openDays.includes(d) && d >= depuis);

  const slots = [];
  for (let t = params.dayStart; t + params.practicalTestDuration <= params.dayEnd; t += params.slotMinutes) {
    if (chevauchePause(params, t, t + params.practicalTestDuration)) continue;
    slots.push(t);
  }

  // Anomalies préexistantes : poser ce test ne doit rien dégrader, mais il n'a
  // pas à corriger ce qui était déjà cassé.
  //
  // Exiger zéro anomalie sur la ligne visée était trop fort : une ligne dont
  // la théorie n'est pas encore posée en porte une, et le test se voyait alors
  // refusé pour un défaut qui ne le concerne pas. On compare donc aux
  // anomalies de départ, une par une — la seule chose interdite est d'en
  // ajouter une nouvelle.
  const baseline = new Map();
  for (const r of computeSchedule(state).rows) baseline.set(r.insc.id, r.errors);

  const essai = (testDay, testStart) => {
    const sim = structuredClone(state);
    const ligne = sim.inscriptions.find((i) => i.id === inscId);
    ligne.dateTestPratique = testDay;
    ligne.debutTestPratique = testStart;
    const { rows } = computeSchedule(sim);
    const row = rows.find((r) => r.insc.id === inscId);
    if (!row) return false;
    const avant = baseline.get(inscId) || [];
    if (row.errors.some((e) => !avant.includes(e))) return false;
    return rows.every((r) => r === row || r.errors.length <= (baseline.get(r.insc.id) || []).length);
  };

  for (const testDay of openDays) {
    // Le même jour, jamais avant la formation du stagiaire.
    const possibles = testDay === cible.datePratique
      ? slots.filter((t) => t >= cible.debutPratique + duree)
      : slots;
    const ordered = parEnchainement(possibles, ancrages(state, testDay, 'test', inscId),
      params.practicalTestDuration);
    for (const testStart of ordered) {
      if (essai(testDay, testStart)) return { dateTestPratique: testDay, debutTestPratique: testStart };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Disponibilités (équivalent de l'onglet « Dispo (auto) ») : pour un brouillon
// d'inscription, indique pour chaque intervenant s'il est habilité et libre
// sur le créneau de pratique (rôle F) et de test pratique (rôle T).
// ---------------------------------------------------------------------------
// Index des occupations par intervenant (hors ligne en cours d'édition),
// partagé entre memberAvailability et availableSlotsFor.
function busyIndex(state, excludeId = null) {
  const { params, team } = state;
  const { rows, theoryTesters, theorySessions } = computeSchedule(state);
  const theoryEnd = params.theoryTime + params.theoryDuration;

  const busy = new Map(team.map((m) => [m.id, []]));
  const add = (id, date, start, end, kind, code) => {
    if (id && busy.has(id)) busy.get(id).push({ date, start, end, kind, code });
  };
  for (const r of rows) {
    if (excludeId != null && r.insc.id === excludeId) continue;
    // Épreuves « test seul » (AIPR) : surveillance — n'occupe pas le testeur
    if (r.insc.datePratique && r.insc.debutPratique != null && !r.formation?.testOnly) {
      add(r.formateurEffectif, r.insc.datePratique, r.insc.debutPratique, r.finPratique, 'formation', r.formation?.code);
    }
    if (r.insc.dateTestPratique && r.insc.debutTestPratique != null) {
      add(r.testeurEffectif, r.insc.dateTestPratique, r.insc.debutTestPratique, r.finTestPratique, 'test', r.formation?.code);
    }
  }
  for (const [date, id] of theoryTesters) add(id, date, params.theoryTime, theoryEnd, 'theorie', null);
  // Sessions de théorie présentielle : le formateur de session est occupé
  for (const s of theorySessions || []) {
    if (excludeId != null && s.rows.every((r) => r.insc.id === excludeId)) continue;
    add(s.formateurId, s.date, s.debut, s.fin, 'theorie-formation', null);
  }

  const freeOn = (formation) => (id, date, start, end, allowSameCat) => {
    const conflicts = (busy.get(id) || []).filter((b) => b.date === date && overlaps(b.start, b.end, start, end));
    if (!conflicts.length) return true;
    if (allowSameCat && formation && (formation.capacite || 1) > 1) {
      return conflicts.every((b) => b.kind === 'formation' && b.code === formation.code)
        && conflicts.length < formation.capacite;
    }
    return false;
  };

  const presentOn = (id, date) => {
    const p = state.dayPresence?.[date];
    return !p || !p.length || p.includes(id);
  };

  return { busy, freeOn, presentOn };
}

export function memberAvailability(state, draft, excludeId = null) {
  const { params, formations } = state;
  const formation = formationByCode(formations, draft.formation);
  const idx = busyIndex(state, excludeId);
  const freeOn = idx.freeOn(formation);
  const presentOn = idx.presentOn;
  const { team } = state;

  return team.filter((m) => m.name.trim()).map((m) => {
    const out = { id: m.id, name: m.name, F: null, T: null };
    if (formation) {
      if (draft.datePratique && draft.debutPratique != null) {
        const end = draft.debutPratique + dureeFor(formation, draft.type);
        const status = (kind, allowSameCat) => !m.quals?.[formation.code]?.[kind] ? 'non-habilite'
          : !presentOn(m.id, draft.datePratique) ? 'absent'
          : freeOn(m.id, draft.datePratique, draft.debutPratique, end, allowSameCat) ? 'libre' : 'occupe';
        // Formation « épreuve seule » : surveillance par un testeur — ne
        // mobilise pas son temps, donc habilité + présent suffit
        if (formation.testOnly) {
          out.T = !m.quals?.[formation.code]?.T ? 'non-habilite'
            : !presentOn(m.id, draft.datePratique) ? 'absent' : 'libre';
        } else out.F = status('F', true);
      }
      if (!formation.testOnly && draft.dateTestPratique && draft.debutTestPratique != null) {
        const end = draft.debutTestPratique + params.practicalTestDuration;
        out.T = !m.quals?.[formation.code]?.T ? 'non-habilite'
          : !presentOn(m.id, draft.dateTestPratique) ? 'absent'
          : freeOn(m.id, draft.dateTestPratique, draft.debutTestPratique, end, false) ? 'libre' : 'occupe';
      }
    }
    return out;
  });
}

// ---------------------------------------------------------------------------
// Créneaux de début réellement disponibles pour une date donnée : il existe
// au moins un intervenant habilité, PRÉSENT ce jour-là et libre sur toute la
// durée. role = 'pratique' (formation, ou épreuve des formations « test
// seul ») ou 'test' (test pratique). Alimente les listes du formulaire
// d'inscription (mode guidé).
// ---------------------------------------------------------------------------
export function availableSlotsFor(state, { formation: code, type, date, role = 'pratique' }, excludeId = null) {
  const { params, team } = state;
  const formation = formationByCode(state.formations, code);
  if (!formation || !date) return [];

  const duration = role === 'test' ? params.practicalTestDuration
    : role === 'theorie' ? dureeTheorieFor({ modeTheorie: 'presentiel', type })
    : dureeFor(formation, type);
  const kind = role === 'test' || (role === 'pratique' && formation.testOnly) ? 'T' : 'F';
  const allowSameCat = role === 'pratique' && kind === 'F';
  // Épreuve « test seul » (AIPR) : surveillance — un superviseur habilité et
  // présent suffit, peu importe ses autres occupations
  const surveillance = role === 'pratique' && !!formation.testOnly;

  const idx = busyIndex(state, excludeId);
  const freeOn = idx.freeOn(formation);
  const members = team.filter((m) => m.name.trim() && m.quals?.[formation.code]?.[kind] && idx.presentOn(m.id, date));
  if (!members.length) return [];

  // La théorie présentielle est la seule séance autorisée à enjamber la pause.
  const enjambePause = role === 'theorie';

  const out = [];
  for (let t = params.dayStart; t + duration <= params.dayEnd; t += params.slotMinutes) {
    if (!enjambePause && chevauchePause(params, t, t + duration)) continue;
    if (surveillance || members.some((m) => freeOn(m.id, date, t, t + duration, allowSameCat))) out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Créneaux proposables pour une théorie PRÉSENTIELLE : rejoindre une session
// existante de la même recommandation/type (créneau identique), ou en ouvrir
// une nouvelle (formateur habilité/présent/libre) — dans les deux cas si la
// salle a encore de la place.
// ---------------------------------------------------------------------------
export function availableTheorieSlots(state, { formation: code, type, date }, excludeId = null) {
  const formation = formationByCode(state.formations, code);
  if (!formation || !date) return [];
  const duration = dureeTheorieFor({ modeTheorie: 'presentiel', type });
  const room = new Set(roomFreeSlots(state, { date, duration }, excludeId));

  const { theorySessions } = computeSchedule(state);
  const joinable = (theorySessions || [])
    .filter((s) => s.date === date && s.reco === formation.reco && s.type === type
      && !s.rows.every((r) => r.insc.id === excludeId))
    .map((s) => s.debut);

  const fresh = availableSlotsFor(state, { formation: code, type, date, role: 'theorie' }, excludeId);
  return [...new Set([...fresh, ...joinable])].filter((t) => room.has(t)).sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Créneaux de salle disponibles : débuts où AJOUTER un stagiaire en salle
// (théorie présentielle ou e-learning en centre) ne dépasse pas la capacité.
// ---------------------------------------------------------------------------
export function roomFreeSlots(state, { date, duration }, excludeId = null) {
  const { params } = state;
  if (!date || !duration) return [];
  const cap = params.salleCapacite ?? 12;
  const { rows, theorySessions } = computeSchedule(state);

  // Occupations de salle du jour : { start, end, stagiaire }
  const uses = [];
  for (const s of theorySessions || []) {
    if (s.date !== date) continue;
    for (const r of s.rows) {
      if (excludeId != null && r.insc.id === excludeId) continue;
      uses.push({ start: s.debut, end: s.fin, stagiaire: r.insc.stagiaire.toLowerCase() });
    }
  }
  for (const r of rows) {
    if (r.cancelled || (excludeId != null && r.insc.id === excludeId)) continue;
    const i = r.insc;
    if (i.modeTheorie === 'centre' && i.dateTheorieFormation === date && i.debutTheorieFormation != null && r.finTheorieFormation) {
      uses.push({ start: i.debutTheorieFormation, end: r.finTheorieFormation, stagiaire: i.stagiaire.toLowerCase() });
    }
  }

  const out = [];
  for (let t = params.dayStart; t + duration <= params.dayEnd; t += params.slotMinutes) {
    let ok = true;
    for (let s = t; s < t + duration && ok; s += params.slotMinutes) {
      const concurrent = new Set(uses.filter((u) => overlaps(u.start, u.end, s, s + params.slotMinutes)).map((u) => u.stagiaire));
      if (concurrent.size >= cap) ok = false;
    }
    if (ok) out.push(t);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Parcours multi-catégories : un stagiaire, plusieurs catégories d'une même
// recommandation ou de recommandations différentes, groupées au plus tôt.
//
// C'est la question que pose un commercial en clientèle — « R489 1A, 3 et 5
// à partir du 15 septembre, qu'est-ce qu'on peut faire ? » — là où
// suggestSlots ne traite qu'une catégorie à la fois.
//
// Méthode : on pose les catégories l'une après l'autre sur un état simulé,
// chaque proposition tenant compte des précédentes. La théorie se mutualise
// d'elle-même, suggestSlots reconnaissant qu'elle est déjà planifiée pour ce
// stagiaire et cette recommandation.
// ---------------------------------------------------------------------------
export function suggestParcours(state, { stagiaire, formations: codes, type = 'Initial', aPartirDu = null, maxOptions = 2 }) {
  if (!stagiaire || !Array.isArray(codes) || !codes.length) return [];

  const options = [];
  let depuis = aPartirDu;

  for (let n = 0; n < Math.max(1, maxOptions); n++) {
    const parcours = composerParcours(state, { stagiaire, codes, type, aPartirDu: depuis });
    if (!parcours) break;
    options.push(parcours);
    // Option suivante : chercher à partir du lendemain du premier jour retenu,
    // pour proposer des dates réellement distinctes et non deux variantes du
    // même jour.
    const lendemain = jourSuivant(state, parcours.jours[0]);
    if (!lendemain) break;
    depuis = lendemain;
  }
  return options;
}

function composerParcours(state, { stagiaire, codes, type, aPartirDu }) {
  // Deux passes d'abord : toutes les formations, puis tous les tests. C'est ce
  // qui rend les journées continues — le formateur enchaîne ses formations, le
  // testeur enchaîne ses tests.
  //
  // À défaut, une passe : chaque catégorie pose sa formation et son test dans
  // la foulée. Ce repli n'est pas décoratif — le regroupement peut ne pas
  // tenir dans la journée alors que l'alternance y tenait, et une proposition
  // moins jolie vaut mieux que pas de proposition. « Dans la mesure du
  // possible » : le groupement est une préférence, jamais une condition.
  return enDeuxPasses(state, { stagiaire, codes, type, aPartirDu })
    || enUnePasse(state, { stagiaire, codes, type, aPartirDu });
}

function enDeuxPasses(state, { stagiaire, codes, type, aPartirDu }) {
  const sim = structuredClone(state);
  const lignes = [];

  // Passe 1 — les formations, enchaînées entre elles.
  //
  // Le plancher glisse sur le jour de la PREMIÈRE catégorie posée : sans lui,
  // une catégorie repoussée au lendemain par une contrainte — le test
  // théorique exige un testeur qui ne soit pas le formateur — laissait les
  // suivantes revenir la veille. Le stagiaire venait deux jours pour un
  // parcours qui tenait en un.
  let plancher = aPartirDu;
  for (const code of codes) {
    const draft = suggestSlots(sim, { stagiaire, formation: code, type, aPartirDu: plancher, sansTest: true });
    if (!draft) return null;
    plancher = draft.datePratique;
    const insc = { id: sim.nextId++, statut: 'pre', modeTheorie: 'distance', ...draft };
    sim.inscriptions.push(insc);
    lignes.push(insc);
  }

  // Passe 2 — les tests pratiques, enchaînés entre eux, après leur formation.
  for (const ligne of lignes) {
    if (!formationByCode(sim.formations, ligne.formation)?.tests) continue;
    const test = suggestTestPratique(sim, ligne.id, { aPartirDu: ligne.datePratique });
    if (!test) return null;
    Object.assign(ligne, test);
  }

  return finaliserParcours(state, sim, lignes);
}

function enUnePasse(state, { stagiaire, codes, type, aPartirDu }) {
  const sim = structuredClone(state);
  const lignes = [];

  for (const code of codes) {
    const draft = suggestSlots(sim, { stagiaire, formation: code, type, aPartirDu });
    if (!draft) return null; // une catégorie ne passe pas : le parcours entier échoue
    const insc = { id: sim.nextId++, statut: 'pre', modeTheorie: 'distance', ...draft };
    sim.inscriptions.push(insc);
    lignes.push(insc);
  }

  return finaliserParcours(state, sim, lignes);
}

function finaliserParcours(state, sim, lignes) {
  const { rows } = computeSchedule(sim);
  const retenues = rows.filter((r) => lignes.some((l) => l.id === r.insc.id));
  // Un parcours proposé ne doit comporter aucune anomalie : le commercial
  // l'annonce au client, il doit être tenable en l'état.
  if (retenues.some((r) => r.errors.length)) return null;

  const jours = [...new Set(retenues.flatMap((r) => [
    r.insc.datePratique, r.insc.dateTestPratique, r.insc.dateTheorie,
  ]).filter(Boolean))].sort();

  return { lignes, jours, seances: seancesDuParcours(state, retenues) };
}

// Déroulé chronologique, prêt à être lu au client : une séance par entrée,
// avec son intitulé, ses bornes et l'intervenant retenu.
function seancesDuParcours(state, rows) {
  const { params } = state;
  const out = [];
  const nom = (id) => memberNameOf(state, id);

  for (const r of rows) {
    const i = r.insc;
    // Le libellé du catalogue commence par « Pratique … » ; on l'ôte pour ne
    // pas dire deux fois le mot dans « Formation pratique — Pratique R489 ».
    const cat = (r.formation?.label || i.formation || '').replace(/^Pratique\s+/i, '');
    if (i.datePratique && i.debutPratique != null) {
      out.push({
        date: i.datePratique, debut: i.debutPratique, fin: r.finPratique,
        genre: r.formation?.testOnly ? 'epreuve' : 'pratique',
        libelle: r.formation?.testOnly ? cat : `Formation pratique — ${cat}`,
        intervenant: nom(r.formation?.testOnly ? r.testeurEffectif : r.formateurEffectif),
      });
    }
    if (i.dateTheorie) {
      out.push({
        date: i.dateTheorie, debut: params.theoryTime, fin: params.theoryTime + params.theoryDuration,
        genre: 'theorie', reco: r.formation?.reco,
        libelle: `Test théorique — ${r.formation?.reco || ''}`.trim(),
        intervenant: nom(r.testeurTheorie),
      });
    }
    if (i.dateTestPratique && i.debutTestPratique != null) {
      out.push({
        date: i.dateTestPratique, debut: i.debutTestPratique, fin: r.finTestPratique,
        genre: 'test', libelle: `Test pratique — ${cat}`,
        intervenant: nom(r.testeurEffectif),
      });
    }
  }

  // La théorie est commune à une recommandation : une seule entrée par
  // couple (date, recommandation), même si plusieurs catégories la portent.
  const vues = new Set();
  const uniques = out.filter((s) => {
    if (s.genre !== 'theorie') return true;
    const cle = `${s.date}|${s.reco}`;
    if (vues.has(cle)) return false;
    vues.add(cle);
    return true;
  });

  return uniques.sort((a, b) => a.date.localeCompare(b.date) || a.debut - b.debut);
}

function memberNameOf(state, id) {
  if (!id) return null;
  return state.team.find((m) => m.id === id)?.name || null;
}

function jourSuivant(state, date) {
  const ouverts = workingDays(state.params).filter((d) => state.openDays.includes(d));
  return ouverts.find((d) => d > date) || null;
}
