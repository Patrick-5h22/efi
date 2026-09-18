// Enchaînement des séances : les formations entre elles, les tests entre eux.
//
// Demande du centre : « lors de la proposition faite par le MCP, il faut faire
// en sorte (dans la mesure du possible) que les formations s'enchaînent et que
// les tests pratiques s'enchaînent également, sauf indisponibilité des
// formateurs. »
//
// Ce que faisait l'outil sur un parcours R489 1A + 3 + 5 : formation, test,
// formation, test, formation, test. Le formateur travaillait de 08:00 à 09:30,
// attendait deux heures et demie, reprenait à 12:00 ; le testeur de même, en
// alternance. Personne ne tenait un bloc continu, et la journée s'étirait
// jusqu'à 17:00.
//
// Le groupement est une PRÉFÉRENCE : il cède devant la validité. Les tests
// ci-dessous vérifient les deux faces — qu'il s'applique quand c'est possible,
// et qu'il cède sans casser la proposition quand ce ne l'est pas.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/store.js';
import { suggestParcours, suggestSlots, suggestTestPratique, computeSchedule } from '../js/engine.js';

const J1 = '2026-09-21'; // lundi
const J2 = '2026-09-22';
const J3 = '2026-09-23';

function etat({ jours = [J1, J2, J3], presence = null } = {}) {
  const s = defaultState();
  s.openDays = [...jours];
  s.inscriptions = [];
  if (presence) s.dayPresence = presence;
  return s;
}

// Séances d'un parcours, triées, avec le genre et les bornes.
function seances(option) {
  return [...option.seances].sort((a, b) => (a.date === b.date ? a.debut - b.debut : (a.date < b.date ? -1 : 1)));
}

// Trous dans la journée d'un intervenant, en minutes. Le test théorique est un
// créneau FIXE (11:00 par défaut) auquel le stagiaire doit assister : le trou
// qu'il impose au formateur n'est pas imputable à la proposition.
function trous(liste) {
  const out = [];
  for (let k = 1; k < liste.length; k += 1) {
    const ecart = liste[k].debut - liste[k - 1].fin;
    if (ecart > 0) out.push({ ecart, avant: liste[k - 1], apres: liste[k] });
  }
  return out;
}

test('parcours : les formations s’enchaînent, les tests s’enchaînent', () => {
  const state = etat();
  const [option] = suggestParcours(state, {
    stagiaire: 'CHAINE Un', formations: ['R489-1A', 'R489-3', 'R489-5'],
    type: 'Initial', aPartirDu: J1, maxOptions: 1,
  });
  assert.ok(option, 'aucune option proposée');

  const liste = seances(option);
  assert.equal(new Set(liste.map((s) => s.date)).size, 1, 'le parcours tient en une journée');

  const pratiques = liste.filter((s) => s.genre === 'pratique');
  const tests = liste.filter((s) => s.genre === 'test');
  assert.equal(pratiques.length, 3);
  assert.equal(tests.length, 3);

  // Aucune formation après un test : c'est l'alternance qu'on supprime.
  const dernierePratique = Math.max(...pratiques.map((s) => s.debut));
  const premierTest = Math.min(...tests.map((s) => s.debut));
  assert.ok(dernierePratique < premierTest,
    `une formation à ${dernierePratique} après un test à ${premierTest} : l’alternance persiste`);

  // Les trois tests sont collés les uns aux autres.
  assert.deepEqual(trous(tests).map((t) => t.ecart), [],
    `tests non contigus : ${tests.map((s) => `${s.debut}-${s.fin}`).join(' ')}`);

  // Les formations aussi, au créneau fixe du test théorique près.
  const theorie = liste.find((s) => s.genre === 'theorie');
  const ecarts = trous(pratiques);
  for (const t of ecarts) {
    assert.ok(theorie && t.avant.fin === theorie.debut && t.apres.debut === theorie.fin,
      `trou de ${t.ecart} min entre formations, hors créneau de théorie`);
  }
});

// Le temps d'attente des intervenants est la mesure qui compte : c'est lui
// qu'on cherchait à réduire.
//
// Avant : formation, test, formation, test, formation, test — le formateur
// accumulait 210 min de creux (150 + 60) et le testeur 210 aussi (30 + 90 +
// 90), soit 420 min perdues sur la journée.
//
// Après : le formateur enchaîne, le testeur enchaîne. Il reste deux creux
// structurels, qu'aucun ordonnancement ne supprime — le test théorique occupe
// le stagiaire à 11:00 (créneau FIXE), et le testeur attend que le stagiaire
// ait fini sa dernière formation avant de pouvoir l'évaluer. 150 min.
test('parcours : le temps d’attente des intervenants s’effondre', () => {
  const state = etat();
  const [option] = suggestParcours(state, {
    stagiaire: 'CHAINE Deux', formations: ['R489-1A', 'R489-3', 'R489-5'],
    type: 'Initial', aPartirDu: J1, maxOptions: 1,
  });
  assert.ok(option);

  const parIntervenant = new Map();
  for (const s of seances(option)) {
    if (!s.intervenant) continue;
    if (!parIntervenant.has(s.intervenant)) parIntervenant.set(s.intervenant, []);
    parIntervenant.get(s.intervenant).push(s);
  }
  assert.ok(parIntervenant.size >= 2, 'au moins deux intervenants mobilisés');

  const detail = [...parIntervenant].map(([qui, liste]) =>
    `${qui} ${trous(liste).reduce((n, t) => n + t.ecart, 0)} min`).join(', ');
  const perdu = [...parIntervenant.values()]
    .reduce((n, liste) => n + trous(liste).reduce((m, t) => m + t.ecart, 0), 0);
  assert.ok(perdu <= 150, `${perdu} min d’attente au total (420 avant correction) — ${detail}`);

  // Et la journée se termine plus tôt : l'alternance l'étirait jusqu'à 17:00.
  const fin = Math.max(...seances(option).map((s) => s.fin));
  assert.ok(fin <= 990, `la journée s’achève à ${fin} (1020 avant correction)`);
});

// Régression introduite en tentant de coller la formation à l'existant : la
// formation partait en fin d'après-midi et son test n'avait plus de place
// derrière — l'outil le posait alors à 08:00, avant la formation.
test('un test pratique n’est jamais proposé avant sa formation', () => {
  const state = etat({ jours: [J1, J2] });
  // Une séance occupe 14:00–15:30 : s'y coller pousserait la formation à 15:30.
  state.inscriptions = [{
    id: 1, stagiaire: 'DEJA La', formation: 'R489-3', type: 'Initial', statut: 'confirmee',
    modeTheorie: 'distance', datePratique: J1, debutPratique: 840, formateurId: 'p1',
  }];
  state.nextId = 2;

  const draft = suggestSlots(state, {
    stagiaire: 'APRES Moi', formation: 'R489-1A', type: 'Initial', aPartirDu: J1, aujourdHui: J1,
  });
  assert.ok(draft, 'aucune proposition');
  const finPratique = draft.debutPratique + 90; // R489-1A Initial : 1h30
  if (draft.dateTestPratique === draft.datePratique) {
    assert.ok(draft.debutTestPratique >= finPratique,
      `test à ${draft.debutTestPratique} alors que la formation finit à ${finPratique}`);
  } else {
    assert.ok(draft.dateTestPratique > draft.datePratique, 'le test ne peut pas précéder le jour de la formation');
  }
});

test('une nouvelle formation se colle à l’existant plutôt que d’ouvrir un trou', () => {
  const state = etat({ jours: [J1, J2] });
  // Séance de 14:00 à 15:30 : la nouvelle doit finir à 14:00 ou partir de 15:30,
  // pas se poser à 08:00 en laissant quatre heures et demie de vide.
  state.inscriptions = [{
    id: 1, stagiaire: 'DEJA La', formation: 'R489-3', type: 'Initial', statut: 'confirmee',
    modeTheorie: 'distance', datePratique: J1, debutPratique: 840, formateurId: 'p1',
  }];
  state.nextId = 2;

  const draft = suggestSlots(state, {
    stagiaire: 'COLLE Moi', formation: 'R489-1A', type: 'Initial', aPartirDu: J1, aujourdHui: J1,
  });
  assert.ok(draft);
  assert.equal(draft.datePratique, J1, 'le même jour reste possible');
  const fin = draft.debutPratique + 90;
  assert.ok(fin === 840 || draft.debutPratique === 930,
    `formation ${draft.debutPratique}–${fin} : ni collée avant 14:00 ni après 15:30`);
});

// « Sauf indisponibilité des formateurs » : le groupement n'est pas une
// condition. Un seul intervenant présent, et la proposition doit rester
// valide — quitte à ne pas être groupée.
test('indisponibilité : le groupement cède, la proposition reste tenable', () => {
  const state = etat({ presence: { [J1]: ['p2'] } });
  const [option] = suggestParcours(state, {
    stagiaire: 'SEUL Present', formations: ['R489-1A', 'R489-3'],
    type: 'Initial', aPartirDu: J1, maxOptions: 1,
  });
  assert.ok(option, 'une proposition doit rester possible malgré l’absence');

  // Une proposition annoncée au client doit être sans anomalie, groupée ou non.
  const sim = structuredClone(state);
  for (const l of option.lignes) sim.inscriptions.push(structuredClone(l));
  const retenues = computeSchedule(sim).rows.filter((r) => option.lignes.some((l) => l.id === r.insc.id));
  for (const r of retenues) {
    assert.deepEqual(r.errors, [], `#${r.insc.id} : ${r.errors.join(' ; ')}`);
  }
});

// Régression : en posant les formations d'abord, une catégorie repoussée au
// lendemain laissait les suivantes revenir la veille — le stagiaire venait
// deux jours pour un parcours qui tenait en un.
test('le parcours ne s’étale pas sur deux jours quand il tient en un', () => {
  const state = etat({ presence: { [J1]: ['p2'] } });
  const [option] = suggestParcours(state, {
    stagiaire: 'UN Seul Jour', formations: ['R489-1A', 'R489-3'],
    type: 'Initial', aPartirDu: J1, maxOptions: 1,
  });
  assert.ok(option);
  assert.equal(new Set(seances(option).map((s) => s.date)).size, 1,
    `parcours réparti sur ${[...new Set(seances(option).map((s) => s.date))].join(' et ')}`);
  // Et chaque catégorie garde sa formation et son test le même jour.
  for (const l of option.lignes) {
    if (l.dateTestPratique) {
      assert.equal(l.dateTestPratique, l.datePratique,
        `la catégorie ${l.formation} teste un autre jour que sa formation`);
    }
  }
});

test('suggestTestPratique : derrière la formation, et collé aux autres tests', () => {
  const state = etat({ jours: [J1] });
  state.inscriptions = [
    // Une formation sans test encore posé, 08:00–09:30
    {
      id: 1, stagiaire: 'A Tester', formation: 'R489-1A', type: 'Initial', statut: 'confirmee',
      modeTheorie: 'distance', datePratique: J1, debutPratique: 480, formateurId: 'p1',
    },
    // Un test déjà en place, 13:00–14:00 : le nouveau doit s'y accrocher
    {
      id: 2, stagiaire: 'B Autre', formation: 'R489-3', type: 'Initial', statut: 'confirmee',
      modeTheorie: 'distance', datePratique: J1, debutPratique: 660, formateurId: 'p1',
      dateTestPratique: J1, debutTestPratique: 780, testeurId: 'p2',
    },
  ];
  state.nextId = 3;

  const test1 = suggestTestPratique(state, 1, { aujourdHui: J1 });
  assert.ok(test1, 'aucun créneau de test trouvé');
  assert.equal(test1.dateTestPratique, J1);
  assert.ok(test1.debutTestPratique >= 570, 'le test suit la formation de 08:00–09:30');
  assert.ok(test1.debutTestPratique === 720 || test1.debutTestPratique === 840,
    `test à ${test1.debutTestPratique} : ni collé avant 13:00 ni après 14:00`);
});

test('suggestTestPratique : rend null sur une ligne sans test obligatoire', () => {
  const state = etat({ jours: [J1] });
  const sansTest = state.formations.find((f) => !f.tests);
  assert.ok(sansTest, 'le catalogue doit comporter une formation sans test');
  state.inscriptions = [{
    id: 1, stagiaire: 'C Sans', formation: sansTest.code, type: 'Initial', statut: 'confirmee',
    modeTheorie: 'distance', datePratique: J1, debutPratique: 480, formateurId: 'p1',
  }];
  state.nextId = 2;
  assert.equal(suggestTestPratique(state, 1, { aujourdHui: J1 }), null);
  assert.equal(suggestTestPratique(state, 99, { aujourdHui: J1 }), null, 'ligne inconnue');
});
