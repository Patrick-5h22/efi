// Jours d'ouverture PAR SITE.
//
// « openDays » était une liste plate : le plateau technique était ouvert, ou il
// ne l'était pas. Avec trois sites, cela ne suffit plus — Périgny II peut
// n'ouvrir que deux jours par semaine sans que Périgny ferme.
//
// Le contrôle général « jour non ouvert (EFI) » ne voit que l'UNION des sites.
// C'est ce qui rend le contrôle par site nécessaire : sans lui, une R482 passe
// un mercredi où Périgny ouvre et Périgny II non.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, migrate, addInscription } from '../js/store.js';
import { computeSchedule, suggestSlots } from '../js/engine.js';
import { joursOuverts, siteOuvertLe, sitesOuvertsLe, basculerJour } from '../js/config.js';

const J = '2026-09-21'; // lundi
const K = '2026-09-22';

const QUALS = Object.fromEntries(
  ['R489-3', 'HAB-ELEC', 'AIPR', 'R482-A'].map((c) => [c, { F: true, T: true }]));

function etat({ ouverts = null } = {}) {
  const s = defaultState();
  s.team = [
    { id: 'p1', name: 'MEDAN Dominique', quals: structuredClone(QUALS) },
    { id: 'p2', name: 'GARCIA Thierry', quals: structuredClone(QUALS) },
  ];
  s.openDays = ouverts || Object.fromEntries(s.sites.map((x) => [x.id, [J, K]]));
  s.dayPresence = {};
  s.inscriptions = [];
  s.nextId = 1;
  return s;
}

// --- Les prédicats --------------------------------------------------------

test('jours : l’union sert au général, le site au particulier', () => {
  const o = { perigny: [J, K], perigny2: [K], saintes: [] };
  assert.deepEqual(joursOuverts(o), [J, K]);

  assert.ok(siteOuvertLe(o, 'perigny', J));
  assert.ok(!siteOuvertLe(o, 'perigny2', J), 'Périgny II n’ouvre pas ce jour-là');
  assert.ok(siteOuvertLe(o, 'perigny2', K));
  assert.ok(!siteOuvertLe(o, 'saintes', J), 'liste vide : jamais ouvert');
  assert.ok(!siteOuvertLe(o, 'inconnu', J), 'site absent : jamais ouvert');

  assert.deepEqual(sitesOuvertsLe(o, J), ['perigny']);
  assert.deepEqual(sitesOuvertsLe(o, K).sort(), ['perigny', 'perigny2']);
});

test('jours : une liste vide et un site absent disent la même chose', () => {
  // Contrairement à « dayPresence », où une journée présente avec une liste
  // VIDE signifie « personne ce jour-là » et une journée absente « tout le
  // monde », il n'y a ici aucune nuance à préserver : une journée non listée
  // est une journée fermée. La base peut donc rendre l'un ou l'autre.
  assert.equal(siteOuvertLe({ saintes: [] }, 'saintes', J), siteOuvertLe({}, 'saintes', J));
  assert.deepEqual(joursOuverts({ saintes: [] }), joursOuverts({}));
});

test('jours : la bascule n’écrit pas dans l’objet qu’on lui passe', () => {
  const avant = { perigny: [J] };
  const apres = basculerJour(avant, 'perigny', K);
  assert.deepEqual(avant, { perigny: [J] }, 'l’original est intact');
  assert.deepEqual(apres.perigny, [J, K]);
  assert.deepEqual(basculerJour(apres, 'perigny', J).perigny, [K], 'et elle referme');
  // Un site encore inconnu de l'objet s'ouvre sans cérémonie.
  assert.deepEqual(basculerJour({}, 'saintes', J), { saintes: [J] });
});

// --- Reprise d'un état antérieur ------------------------------------------

test('reprise : une liste plate devient ouverte sur tous les sites', () => {
  // Ce qui était ouvert « tout court » l'était pour tout le monde : c'est la
  // seule lecture fidèle d'un état enregistré avant les sites.
  const s = migrate({
    version: 1, params: {}, formations: [], team: [], inscriptions: [],
    openDays: [K, J, J],
  });
  assert.deepEqual(Object.keys(s.openDays).sort(), ['perigny', 'perigny2', 'saintes']);
  for (const id of Object.keys(s.openDays)) {
    assert.deepEqual(s.openDays[id], [J, K], `${id} : trié et dédoublonné`);
  }
});

test('reprise : un objet déjà par site n’est pas touché', () => {
  const s = migrate({
    version: 1, params: {}, formations: [], team: [], inscriptions: [],
    openDays: { perigny: [K, J], perigny2: [] },
  });
  assert.deepEqual(s.openDays.perigny, [J, K]);
  assert.deepEqual(s.openDays.perigny2, []);
  assert.equal(s.openDays.saintes, undefined, 'aucun site n’est ouvert d’office');
});

test('reprise : une valeur incohérente vaut « rien d’ouvert », pas une erreur', () => {
  const s = migrate({
    version: 1, params: {}, formations: [], team: [], inscriptions: [],
    openDays: 'nimporte quoi',
  });
  assert.deepEqual(s.openDays, {});
  assert.deepEqual(joursOuverts(s.openDays), []);
});

// --- Ce que le moteur en fait ---------------------------------------------

const pose = (s, over) => addInscription(s, {
  stagiaire: 'CANDIDAT Un', formation: 'HAB-ELEC', type: 'Initial',
  statut: 'confirmee', modeTheorie: 'distance',
  datePratique: J, debutPratique: 480,
  ...over,
});

test('moteur : un site fermé refuse la séance, même si un autre ouvre', () => {
  const s = etat({ ouverts: { perigny: [J], perigny2: [], saintes: [J] } });
  // La R482 ne se tient qu'à Périgny II, fermé. Le contrôle général, lui, voit
  // bien un jour ouvert : c'est exactement le trou que le contrôle par site
  // vient boucher.
  //
  // La R482 est au catalogue depuis le 06/10 : ces fixtures la poussaient
  // elles-mêmes, et le doublon aurait été silencieux — c'est l'entrée réelle
  // qui l'emporte, avec ses tests. On prend donc celle du catalogue.
  pose(s, { formation: 'R482-A', formateurId: 'p1' });
  const [r] = computeSchedule(s).rows;
  assert.ok(!r.errors.some((e) => /jour non ouvert/.test(e)),
    `le jour EST ouvert quelque part : ${r.errors.join(' | ')}`);
  assert.ok(r.errors.some((e) => /aucun site ouvert ce jour/.test(e)), r.errors.join(' | '));
  assert.ok(r.errors.some((e) => /Périgny II/.test(e)), 'l’anomalie nomme le lieu attendu');
  assert.equal(r.zonePratique, null);
});

test('moteur : le même dispositif passe le jour où le site ouvre', () => {
  const s = etat({ ouverts: { perigny: [J], perigny2: [K], saintes: [] } });
  pose(s, { formation: 'R482-A', formateurId: 'p1', datePratique: K });
  const [r] = computeSchedule(s).rows;
  // Seules les anomalies de LIEU nous regardent ici : la fixture ne pose
  // volontairement ni test pratique ni test théorique, et les réclamer est
  // juste — mais sans rapport avec le jour d'ouverture.
  const lieu = r.errors.filter((e) => /zone|plateau|site|ouvert/i.test(e));
  assert.deepEqual(lieu, [], r.errors.join(' | '));
  assert.ok(['z-r482-1', 'z-r482-2'].includes(r.zonePratique), r.zonePratique);
});

test('moteur : une formation présente sur deux sites bascule sur celui qui ouvre', () => {
  // L'habilitation électrique se tient à Périgny ET à Saintes. Périgny fermé,
  // la séance ne doit pas échouer : elle part à Saintes.
  const s = etat({ ouverts: { perigny: [], perigny2: [], saintes: [J] } });
  pose(s, { formateurId: 'p1' });
  const [r] = computeSchedule(s).rows;
  assert.deepEqual(r.errors, [], r.errors.join(' | '));
  assert.equal(r.zonePratique, 'z-elec-s', 'la zone de Saintes');
});

test('moteur : une zone imposée sur un site fermé est refusée', () => {
  const s = etat({ ouverts: { perigny: [], perigny2: [], saintes: [J] } });
  pose(s, { formateurId: 'p1', zoneId: 'z-elec-p' });
  const [r] = computeSchedule(s).rows;
  assert.ok(r.errors.some((e) => /Périgny est fermé ce jour-là/.test(e)), r.errors.join(' | '));
});

test('moteur : plus aucun site ouvert, le contrôle général reprend la main', () => {
  const s = etat({ ouverts: { perigny: [], perigny2: [], saintes: [] } });
  pose(s, { formateurId: 'p1' });
  const [r] = computeSchedule(s).rows;
  assert.ok(r.errors.some((e) => /jour non ouvert/.test(e)), r.errors.join(' | '));
});

test('proposition : le moteur ne propose pas un jour où le site du plateau est fermé', () => {
  const s = etat({ ouverts: { perigny: [J], perigny2: [], saintes: [K] } });
  const prop = suggestSlots(s, {
    stagiaire: 'CANDIDAT Neuf', formation: 'HAB-ELEC', type: 'Initial', aujourdHui: J,
  });
  assert.ok(prop, 'une proposition existe');
  // Les deux jours offrent un site : le J à Périgny, le K à Saintes. Dans les
  // deux cas la proposition doit être tenable.
  const sim = etat({ ouverts: { perigny: [J], perigny2: [], saintes: [K] } });
  addInscription(sim, { ...prop, statut: 'confirmee', modeTheorie: 'distance' });
  const [r] = computeSchedule(sim).rows;
  assert.deepEqual(r.errors, [], `${JSON.stringify(prop)} → ${r.errors.join(' | ')}`);
});

test('occupation : un jour ouvert sur un seul site compte comme un jour ouvert', () => {
  // L'union est la bonne mesure pour le tableau de bord : une journée où
  // Saintes seul ouvre est bien une journée d'activité.
  const s = etat({ ouverts: { perigny: [J], perigny2: [], saintes: [K] } });
  assert.deepEqual(joursOuverts(s.openDays), [J, K]);
});
