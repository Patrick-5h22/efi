// Outils MCP : ce qu'un commercial obtient, et ce qu'il ne peut pas obtenir.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState } from '../js/store.js';
import { computeSchedule } from '../js/engine.js';
import { outils, chercherCreneaux, preReserver } from '../js/mcp.js';

const QUALS = { 'R489-1A': { F: true, T: true }, 'R489-3': { F: true, T: true }, 'R489-5': { F: true, T: true } };

function base({ jours = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17'] } = {}) {
  const state = defaultState();
  state.team = [
    { id: 'p1', name: 'MEDAN Dominique', quals: structuredClone(QUALS) },
    { id: 'p2', name: 'GARCIA Thierry', quals: structuredClone(QUALS) },
  ];
  state.openDays = jours;
  state.inscriptions = [];
  return state;
}

const CATS = ['R489-3', 'R489-5'];

// « Aujourd'hui » est injecté. Ces scénarios sont datés de septembre 2026 :
// laissés à l'horloge réelle, ils basculeraient dans le passé, la recherche
// les écarterait, et les tests vieilliraient au lieu de décrire une règle.
const LE = { aujourdHui: '2026-09-14' };

// --- Définitions exposées ---

test('mcp : deux outils, dont un seul écrit', () => {
  const defs = outils(base());
  assert.deepEqual(defs.map((d) => d.name), ['chercher_creneaux', 'pre_reserver']);
  assert.match(defs[0].description, /[Ll]ecture seule/);
});

test('mcp : la liste des catégories vient du catalogue, pas du code', () => {
  const state = base();
  state.formations.push({
    code: 'R485-9', label: 'Pratique R485 Cat 9', reco: 'R485',
    dureeInitial: 90, dureeRecyclage: 60, tests: true, capacite: 1,
  });
  const defs = outils(state);
  const enumCodes = defs[0].inputSchema.properties.formations.items.enum;
  assert.ok(enumCodes.includes('R485-9'), 'un produit ajouté aux Paramètres devient proposable');
  assert.ok(enumCodes.includes('AIPR'));
});

// --- chercher_creneaux ---

test('mcp : une recherche renvoie des options et un texte lisible', () => {
  const r = chercherCreneaux(base(), { formations: CATS, type: 'Initial', a_partir_du: '2026-09-15' }, LE);
  assert.ok(r.options.length >= 1);
  assert.match(r.texte, /Possibilités pour/);
  assert.match(r.texte, /Formation pratique/);
  assert.match(r.texte, /Test théorique/);
  assert.match(r.texte, /Rien n’est réservé/, 'le commercial doit savoir que rien n’est bloqué');
});

test('mcp : la recherche respecte la date demandée', () => {
  const r = chercherCreneaux(base(), { formations: CATS, a_partir_du: '2026-09-16' }, LE);
  for (const o of r.options) {
    for (const j of o.jours) assert.ok(j >= '2026-09-16', j);
  }
});

// Une disponibilité est toujours à venir. La recherche partait du début de la
// période : sans date de départ, elle proposait des journées écoulées — vu en
// clientèle, l'assistant a dû écarter les dates à la main.
test('mcp : sans date de départ, la recherche part d’aujourd’hui', () => {
  const state = base({ jours: ['2026-09-08', '2026-09-09', '2026-09-16', '2026-09-17'] });
  const r = chercherCreneaux(state, { formations: CATS }, { aujourdHui: '2026-09-15' });
  assert.ok(r.options.length >= 1, 'des dates à venir existent');
  for (const o of r.options) {
    for (const j of o.jours) assert.ok(j >= '2026-09-15', `journée écoulée proposée : ${j}`);
  }
  assert.match(r.texte, /à partir d’aujourd’hui \(Mar 15\/09\)/);
});

test('mcp : une date de départ déjà passée est ramenée à aujourd’hui, et c’est dit', () => {
  const state = base({ jours: ['2026-09-08', '2026-09-16'] });
  const r = chercherCreneaux(state, { formations: CATS, a_partir_du: '2026-09-08' },
    { aujourdHui: '2026-09-15' });
  for (const o of r.options) {
    for (const j of o.jours) assert.ok(j >= '2026-09-15', j);
  }
  assert.match(r.texte, /Mar 08\/09 demandé est déjà passé/,
    'les dates rendues ne correspondent pas à la question : il faut le dire');
});

test('mcp : aujourd’hui reste proposable — ce n’est pas le passé', () => {
  const state = base({ jours: ['2026-09-15', '2026-09-16'] });
  const r = chercherCreneaux(state, { formations: CATS }, { aujourdHui: '2026-09-15' });
  assert.equal(r.options[0].jour, '2026-09-15');
});

test('mcp : pré-réserver dans le passé est refusé, et nommé comme tel', () => {
  const state = base({ jours: ['2026-09-14', '2026-09-16'] });
  assert.throws(() => preReserver(state, {
    stagiaire: 'DURAND Thomas', formations: CATS, jour: '2026-09-14',
  }, { aujourdHui: '2026-09-15' }), (e) => {
    assert.ok(e.metier);
    assert.match(e.message, /déjà passé/);
    return true;
  });
});

test('mcp : nb_options est borné', () => {
  const r = chercherCreneaux(base(), { formations: CATS, nb_options: 99 }, LE);
  assert.ok(r.options.length <= 3, `${r.options.length} options`);
});

test('mcp : une recherche ne modifie pas l’état reçu', () => {
  const state = base();
  const avant = JSON.stringify(state);
  chercherCreneaux(state, { formations: CATS }, LE);
  assert.equal(JSON.stringify(state), avant, 'chercher_creneaux est en lecture seule');
});

test('mcp : aucune possibilité → message explicite, pas une erreur', () => {
  const r = chercherCreneaux(base({ jours: [] }), { formations: CATS }, LE);
  assert.deepEqual(r.options, []);
  assert.match(r.texte, /Aucune possibilité/);
});

test('mcp : catégorie inconnue → erreur métier nommant le catalogue', () => {
  assert.throws(() => chercherCreneaux(base(), { formations: ['R489-42'] }, LE), (e) => {
    assert.ok(e.metier, 'doit être une erreur métier');
    assert.match(e.message, /R489-42/);
    assert.match(e.message, /Catalogue/);
    return true;
  });
});

test('mcp : aucune catégorie → erreur métier', () => {
  assert.throws(() => chercherCreneaux(base(), { formations: [] }, LE), (e) => e.metier);
  assert.throws(() => chercherCreneaux(base(), {}, LE), (e) => e.metier);
});

// --- pre_reserver ---

test('mcp : la pré-réservation pose des lignes « pré-réservée »', () => {
  const state = base();
  const jour = chercherCreneaux(state, { formations: CATS, a_partir_du: '2026-09-15' }, LE).options[0].jour;

  const r = preReserver(state, {
    stagiaire: 'DURAND Thomas', formations: CATS, jour, entreprise: 'BTP Charente',
  }, { ...LE, par: 'Jean Dupont' });

  assert.equal(r.lignes.length, 2);
  for (const l of r.lignes) {
    assert.equal(l.statut, 'pre');
    assert.equal(l.stagiaire, 'DURAND Thomas');
    assert.equal(l.entreprise, 'BTP Charente');
    assert.equal(l.reservePar, 'Jean Dupont', 'la pré-réservation doit être traçable');
    assert.ok(l.reserveLe, 'horodatage attendu');
  }
  assert.match(r.texte, /Pré-réservation posée/);
  assert.match(r.texte, /assistante doit confirmer/);
});

test('mcp : l’état rendu est sain et contient les nouvelles lignes', () => {
  const state = base();
  const jour = chercherCreneaux(state, { formations: CATS, a_partir_du: '2026-09-15' }, LE).options[0].jour;
  const r = preReserver(state, { stagiaire: 'DURAND Thomas', formations: CATS, jour }, LE);

  assert.equal(r.state.inscriptions.length, 2);
  const { rows } = computeSchedule(r.state);
  for (const row of rows) assert.deepEqual(row.errors, [], row.errors.join(' | '));
});

test('mcp : la pré-réservation ne modifie pas l’état reçu', () => {
  const state = base();
  const jour = chercherCreneaux(state, { formations: CATS, a_partir_du: '2026-09-15' }, LE).options[0].jour;
  const avant = JSON.stringify(state);
  preReserver(state, { stagiaire: 'DURAND Thomas', formations: CATS, jour }, LE);
  assert.equal(JSON.stringify(state), avant, 'l’appelant décide d’enregistrer, pas l’outil');
});

test('mcp : le nom du stagiaire est obligatoire pour réserver', () => {
  const state = base();
  assert.throws(() => preReserver(state, { formations: CATS, jour: '2026-09-15' }, LE), (e) => {
    assert.ok(e.metier);
    assert.match(e.message, /stagiaire/);
    return true;
  });
});

test('mcp : un jour absent ou mal formé est refusé', () => {
  const state = base();
  for (const jour of [undefined, '', '15/09/2026', 'demain']) {
    assert.throws(() => preReserver(state, { stagiaire: 'X', formations: CATS, jour }, LE), (e) => e.metier);
  }
});

test('mcp : un jour non disponible est refusé, jamais décalé en silence', () => {
  // Le commercial annonce une date au client ; si elle n'est plus tenable,
  // l'outil doit le dire et non poser discrètement le jour suivant.
  const state = base({ jours: ['2026-09-16', '2026-09-17'] });
  assert.throws(() => preReserver(state, {
    stagiaire: 'DURAND Thomas', formations: CATS, jour: '2026-09-14',
  }, LE), (e) => {
    assert.ok(e.metier);
    assert.match(e.message, /n’est plus disponible|Relancez la recherche/);
    assert.match(e.message, /16/, 'le message doit nommer la date réellement libre');
    return true;
  });
});

test('mcp : plus aucun créneau du tout → refus explicite', () => {
  const state = base({ jours: [] });
  assert.throws(() => preReserver(state, {
    stagiaire: 'DURAND Thomas', formations: CATS, jour: '2026-09-15',
  }, LE), (e) => {
    assert.ok(e.metier);
    assert.match(e.message, /Plus aucun créneau/);
    return true;
  });
});

test('mcp : deux pré-réservations successives ne se chevauchent pas', () => {
  const state = base();
  const j1 = chercherCreneaux(state, { formations: CATS, a_partir_du: '2026-09-14' }, LE).options[0].jour;
  const un = preReserver(state, { stagiaire: 'PREMIER Candidat', formations: CATS, jour: j1 }, LE);

  const j2 = chercherCreneaux(un.state, { formations: CATS, a_partir_du: j1 }, LE).options[0].jour;
  const deux = preReserver(un.state, { stagiaire: 'SECOND Candidat', formations: CATS, jour: j2 }, LE);

  const { rows } = computeSchedule(deux.state);
  assert.equal(rows.length, 4);
  for (const row of rows) assert.deepEqual(row.errors, [], row.errors.join(' | '));
});

test('mcp : les champs de gestion restent à compléter par l’assistante', () => {
  const state = base();
  const jour = chercherCreneaux(state, { formations: CATS, a_partir_du: '2026-09-15' }, LE).options[0].jour;
  const r = preReserver(state, { stagiaire: 'DURAND Thomas', formations: CATS, jour }, LE);
  for (const l of r.lignes) {
    assert.equal(l.dossierYpareo, null, 'le commercial ne saisit pas le dossier YPAREO');
    assert.equal(l.chiffreAffaires, null, 'ni le montant');
  }
});

test('mcp : dans une option, la date de début n’est pas annoncée deux fois', () => {
  // L'en-tête d'option porte déjà le premier jour ; les en-têtes de journée
  // ne doivent couvrir que les jours suivants.
  const r = chercherCreneaux(base(), { formations: CATS, a_partir_du: '2026-09-14', nb_options: 2 }, LE);
  const blocs = r.texte.split(/^Option \d+ — /m).slice(1);
  assert.ok(blocs.length >= 2, `${blocs.length} bloc(s) d’option`);

  for (const bloc of blocs) {
    const debut = bloc.split('\n')[0].trim(); // ex. « Lun 14/09 »
    const rappels = (bloc.match(new RegExp(`^\\s+${debut.replace('/', '\\/')}$`, 'gm')) || []).length;
    assert.equal(rappels, 0, `« ${debut} » est rappelé ${rappels} fois dans son propre bloc`);
  }
});
