// Moteur de planification : calcule pour chaque inscription les horaires dérivés,
// les intervenants effectifs (affectation automatique) et les contrôles (STATUT).
// Reproduit les règles du classeur "Planification EFI v4.2".

import { formationByCode, dureeFor, dureeTheorieFor } from './config.js';
import { isoWeek, overlaps, workingDays, fmtTime, mondayOf, weekDays, toISO } from './dates.js';

// ---------------------------------------------------------------------------
// Calcul principal : retourne un tableau de "lignes calculées" alignées sur
// state.inscriptions, plus des index utiles aux vues.
// ---------------------------------------------------------------------------
export function computeSchedule(state) {
  const { params, formations, team, inscriptions } = state;
  const openDays = new Set(state.openDays);
  const validDays = new Set(workingDays(params));
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
  validateRows(active, { state, params, openDays, validDays, theoryDays, theoryTesters, qualified, presentOn, theorySessions });

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
  const { state, params, openDays, validDays, theoryTesters, qualified, presentOn, theorySessions = [] } = ctx;
  const theoryEnd = params.theoryTime + params.theoryDuration;
  const pratiqueLabel = (row) => (row.formation?.testOnly ? 'Épreuve' : 'Pratique');
  const memberNameOf = (st, id) => st.team.find((m) => m.id === id)?.name || id;

  const checkDay = (row, date, label) => {
    if (!date) return;
    if (!validDays.has(date)) row.errors.push(`${label} : hors période ou jour non ouvré`);
    else if (!openDays.has(date)) row.errors.push(`${label} : jour non ouvert (EFI)`);
  };

  const checkWindow = (row, start, end, label) => {
    if (start == null) return;
    if (start < params.dayStart || end > params.dayEnd) {
      row.errors.push(`${label} : hors plage ${fmtTime(params.dayStart)}–${fmtTime(params.dayEnd)}`);
    }
    if (start % params.slotMinutes !== 0) {
      row.errors.push(`${label} : début non aligné sur un créneau de ${params.slotMinutes} min`);
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
      checkWindow(row, insc.debutTheorieFormation, row.finTheorieFormation, label);
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
  // Les épreuves « test seul » ne comptent pas comme formation pratique.
  const intervalsByDayTrainer = new Map();
  for (const row of rows) {
    if (row.formation?.testOnly) continue;
    if (!row.insc.datePratique || row.insc.debutPratique == null) continue;
    const key = `${row.insc.datePratique}|${row.formateurEffectif || '?'}`;
    if (!intervalsByDayTrainer.has(key)) intervalsByDayTrainer.set(key, []);
    intervalsByDayTrainer.get(key).push({ start: row.insc.debutPratique, end: row.finPratique });
  }
  const loadByDayTrainer = new Map();
  for (const [key, list] of intervalsByDayTrainer) loadByDayTrainer.set(key, unionDuration(list));
  for (const row of rows) {
    if (row.formation?.testOnly) continue;
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

// ---------------------------------------------------------------------------
// Occupation par jour (heatmap) : créneaux réservés / créneaux offerts
// (2 ressources — formateur et testeur — × créneaux de la journée).
// ---------------------------------------------------------------------------
export function occupancyByDay(state, schedule) {
  const { params } = state;
  const slotsPerDay = Math.floor((params.dayEnd - params.dayStart) / params.slotMinutes);
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
    // Les épreuves « test seul » (AIPR) sont de la surveillance : 0 temps
    // d'intervenant mobilisé, elles ne pèsent pas dans l'occupation.
    if (i.datePratique && i.debutPratique != null && !r.formation?.testOnly) {
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
  const today = todayISO || toISO(new Date());
  const ref = today < params.periodStart ? params.periodStart
    : today > params.periodEnd ? params.periodEnd : today;

  let isIn = () => true;
  if (scope === 'semaine') {
    const week = new Set(weekDays(mondayOf(ref)));
    isIn = (d) => week.has(d);
  } else if (scope === 'mois') {
    const ym = ref.slice(0, 7);
    isIn = (d) => !!d && d.startsWith(ym);
  }

  const working = workingDays(params).filter(isIn);
  const openDays = state.openDays.filter((d) => working.includes(d));
  return { scope, ref, isIn, workingCount: working.length, openDays };
}

// Une ligne appartient à la portée si l'une de ses activités (pratique ou
// test pratique) y a lieu. Sur la période complète, tout compte — y compris
// les inscriptions pas encore planifiées.
export function rowInScope(row, win) {
  if (win.scope === 'periode') return true;
  return !!(row.insc.datePratique && win.isIn(row.insc.datePratique))
    || !!(row.insc.dateTestPratique && win.isIn(row.insc.dateTestPratique));
}

export function occupationSummary(state, schedule, scope = 'periode', todayISO = null) {
  const { params } = state;
  const win = scopeWindow(state, scope, todayISO);
  const ref = win.ref;

  const scopeDays = new Set(win.openDays);
  const slotsPerDay = (params.dayEnd - params.dayStart) / params.slotMinutes;
  const total = scopeDays.size * slotsPerDay;

  let busy = 0;
  for (const r of schedule.rows) {
    if (r.cancelled) continue;
    const i = r.insc;
    // Épreuves « test seul » (AIPR) : surveillance, 0 temps mobilisé
    if (i.datePratique && i.debutPratique != null && scopeDays.has(i.datePratique) && !r.formation?.testOnly) {
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
    ref, // date de référence (ramenée dans la période) — pour le libellé
    days: scopeDays.size,
    pct: total ? Math.min(100, Math.round((busy / total) * 100)) : 0,
    hours: busy * params.slotMinutes / 60,
  };
}

// ---------------------------------------------------------------------------
// Proposition automatique de créneaux : première combinaison
// pratique (+ test pratique + théorie si obligatoires) sans anomalie.
// ---------------------------------------------------------------------------
export function suggestSlots(state, { stagiaire, formation: code, type }, excludeId = null) {
  const { params } = state;
  const formation = formationByCode(state.formations, code);
  if (!formation || !stagiaire) return null;
  const duree = dureeFor(formation, type);
  const openDays = workingDays(params).filter((d) => state.openDays.includes(d));
  const slots = [];
  for (let t = params.dayStart; t + params.slotMinutes <= params.dayEnd; t += params.slotMinutes) slots.push(t);

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

  for (const day of openDays) {
    for (const start of slots) {
      if (start + duree > params.dayEnd) continue;
      const base = { stagiaire, formation: code, type, datePratique: day, debutPratique: start };
      if (++trials > maxTrials) return null;
      if (!formation.tests) {
        if (trial(base)) return base;
        continue;
      }
      // Pré-vérification : la pratique seule doit passer (seuls les tests manquants sont tolérés)
      const withTheory = { ...base, dateTheorie: hasTheory ? null : day };
      if (!trial(withTheory, IGNORE_MISSING_TESTS)) continue;
      // Test pratique : même jour de préférence, sinon jours suivants.
      // Le même jour, on privilégie un créneau APRÈS la formation pratique.
      for (const testDay of openDays.filter((d) => d >= day)) {
        const ordered = testDay === day
          ? [...slots.filter((t) => t >= start + duree), ...slots.filter((t) => t < start + duree)]
          : slots;
        for (const testStart of ordered) {
          if (testStart + params.practicalTestDuration > params.dayEnd) continue;
          if (testDay === day && overlaps(start, start + duree, testStart, testStart + params.practicalTestDuration)) continue;
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

  const out = [];
  for (let t = params.dayStart; t + duration <= params.dayEnd; t += params.slotMinutes) {
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
