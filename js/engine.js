// Moteur de planification : calcule pour chaque inscription les horaires dérivés,
// les intervenants effectifs (affectation automatique) et les contrôles (STATUT).
// Reproduit les règles du classeur "Planification EFI v4.2".

import { formationByCode, dureeFor } from './config.js';
import { isoWeek, overlaps, workingDays, fmtTime } from './dates.js';

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
    return {
      insc,
      formation,
      duree,
      finPratique: insc.debutPratique != null ? insc.debutPratique + duree : null,
      finTestPratique: insc.debutTestPratique != null ? insc.debutTestPratique + params.practicalTestDuration : null,
      heureTheorie: insc.dateTheorie ? params.theoryTime : null,
      semaine: insc.datePratique ? isoWeek(insc.datePratique) : null,
      formateurEffectif: null,
      testeurEffectif: null,
      testeurTheorie: null,
      errors: [],
    };
  });

  // --- Théorie : jours où au moins un candidat a un test théorique ---
  const theoryDays = new Set(rows.filter((r) => r.insc.dateTheorie).map((r) => r.insc.dateTheorie));

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

  const dayAssign = (date) => state.dayAssignments[date] || {};

  const pickPerson = (date, code, kind, freeFn) => {
    const preferred = kind === 'F' ? dayAssign(date).formateur : dayAssign(date).testeur;
    const candidates = [];
    if (preferred) candidates.push(preferred);
    for (const m of team) if (!candidates.includes(m.id)) candidates.push(m.id);
    for (const id of candidates) {
      if (qualified(id, code, kind) && freeFn(id)) return id;
    }
    return null;
  };

  // Théorie : testeur du jour (auto si non affecté). Bloque le créneau théorie.
  const theoryTesters = new Map(); // date -> personId|null
  for (const date of theoryDays) {
    let tester = dayAssign(date).testeur || null;
    if (!tester) {
      // premier intervenant habilité T sur n'importe quelle reco testée ce jour-là
      const codes = rows.filter((r) => r.insc.dateTheorie === date && r.formation?.tests).map((r) => r.formation.code);
      tester = team.find((m) => codes.some((c) => qualified(m.id, c, 'T')))?.id
        || team.find((m) => Object.values(m.quals || {}).some((q) => q.T))?.id
        || null;
    }
    theoryTesters.set(date, tester);
    addBusy(tester, { date, start: params.theoryTime, end: theoryEnd, kind: 'theorie' });
  }

  // Passe déterministe dans l'ordre des inscriptions (comme le classeur)
  for (const row of rows) {
    const { insc, formation } = row;
    if (!formation) continue;

    // Formateur effectif (pratique)
    if (insc.datePratique && insc.debutPratique != null) {
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

    // Testeur effectif (test pratique)
    if (insc.dateTestPratique && insc.debutTestPratique != null && formation.tests) {
      const { dateTestPratique: date, debutTestPratique: start } = insc;
      const end = row.finTestPratique;
      if (insc.testeurId) {
        row.testeurEffectif = insc.testeurId;
      } else {
        row.testeurEffectif = pickPerson(date, formation.code, 'T', (id) => isFree(id, date, start, end));
        if (!row.testeurEffectif) row.errors.push('Aucun testeur disponible');
      }
      addBusy(row.testeurEffectif, { date, start, end, kind: 'test', formation: formation.code, inscId: insc.id });
    }

    if (insc.dateTheorie) {
      row.testeurTheorie = theoryTesters.get(insc.dateTheorie) || null;
    }
  }

  // --- Contrôles ----------------------------------------------------------
  validateRows(rows, { state, params, openDays, validDays, theoryDays, theoryTesters, qualified });

  return {
    rows,
    theoryDays,
    theoryTesters,
    // Nombre de candidats au test théorique du jour (stagiaires uniques)
    theoryCandidates: (date) => new Set(
      rows.filter((r) => r.insc.dateTheorie === date).map((r) => r.insc.stagiaire.toLowerCase())
    ).size,
  };
}

// ---------------------------------------------------------------------------
// Contrôles automatiques — colonne STATUT
// ---------------------------------------------------------------------------
function validateRows(rows, ctx) {
  const { state, params, openDays, validDays, theoryTesters, qualified } = ctx;
  const theoryEnd = params.theoryTime + params.theoryDuration;

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
    checkDay(row, insc.datePratique, 'Pratique');
    checkDay(row, insc.dateTheorie, 'Théorie');
    checkDay(row, insc.dateTestPratique, 'Test pratique');
    checkWindow(row, insc.debutPratique, row.finPratique, 'Pratique');
    checkWindow(row, insc.debutTestPratique, row.finTestPratique, 'Test pratique');

    if (insc.datePratique && insc.debutPratique == null) row.errors.push('Heure de début de pratique manquante');
    if (!insc.datePratique) row.errors.push('Date de pratique manquante');

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

    // Formateur ≠ testeur du même candidat
    if (row.formateurEffectif) {
      if (row.testeurEffectif && row.formateurEffectif === row.testeurEffectif) {
        row.errors.push('Formateur = testeur du candidat (test pratique)');
      }
      if (row.testeurTheorie && row.formateurEffectif === row.testeurTheorie) {
        row.errors.push('Formateur = testeur du candidat (théorie)');
      }
    }
  }

  // --- Conflits croisés entre lignes ---
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      crossChecks(rows[i], rows[j], params);
    }
  }

  // Test pratique pendant le créneau théorie du MÊME testeur
  for (const row of rows) {
    const { insc } = row;
    if (!insc.dateTestPratique || insc.debutTestPratique == null) continue;
    const theoryTester = theoryTesters.get(insc.dateTestPratique);
    if (theoryTester && row.testeurEffectif === theoryTester
      && overlaps(insc.debutTestPratique, row.finTestPratique, params.theoryTime, theoryEnd)) {
      row.errors.push('Test pratique pendant le créneau théorie');
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

  // Charge : formation pratique ≤ max / jour / formateur effectif
  const loadByDayTrainer = new Map();
  for (const row of rows) {
    if (!row.insc.datePratique || row.insc.debutPratique == null) continue;
    const key = `${row.insc.datePratique}|${row.formateurEffectif || '?'}`;
    loadByDayTrainer.set(key, (loadByDayTrainer.get(key) || 0) + row.duree);
  }
  for (const row of rows) {
    if (!row.insc.datePratique || row.insc.debutPratique == null) continue;
    const key = `${row.insc.datePratique}|${row.formateurEffectif || '?'}`;
    if (loadByDayTrainer.get(key) > params.maxDailyLoad) {
      row.errors.push(`Charge > ${fmtTime(params.maxDailyLoad).replace(':', 'h')} de pratique ce jour`);
    }
  }

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
      return out;
    };
    for (const sa of slots(a)) {
      for (const sb of slots(b)) {
        if (sa.date === sb.date && overlaps(sa.start, sa.end, sb.start, sb.end)
          && !(sa.label === 'théorie' && sb.label === 'théorie')) {
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
