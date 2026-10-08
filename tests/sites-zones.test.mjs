// Sites, zones d'évolution et matériels partagés — le paramétrage.
//
// Spécification : docs/SITES-ZONES-PARCOURS.md, § 2 à 4. Ce fichier couvre le
// PARAMÉTRAGE et ce qui en découle mécaniquement — quelles zones admettent
// quel dispositif, sur quel site, dans quel pôle. Les contraintes du moteur
// (capacité d'une zone à un instant donné, matériel partagé, règle de pôle sur
// une journée) viennent ensuite et ont leur propre fichier.
//
// Ce qui se joue ici : les deux « règles » du premier courriel d'Emmanuel
// n'existent pas en tant que règles. La mutualisation R485 / R489 1A-1B est
// une zone qui admet quatre dispositifs, et le « 2 en parallèle sur 3 et/ou
// 5 » est deux zones à une session. Les deux DÉCOULENT du modèle — et ces
// tests le vérifient plutôt que de le supposer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, migrate } from '../js/store.js';
import {
  admetDispositif, zonesPour, sitesPour, siteById, poleDuSite, referencesInconnues,
  formationByCode,
} from '../js/config.js';
import { PERSISTED_FIELDS } from '../js/persisted.js';

const etat = () => defaultState();
const dispositif = (s, code) => formationByCode(s.formations, code);

// --- Les trois sites ------------------------------------------------------

test('sites : trois lieux, deux pôles', () => {
  const s = etat();
  assert.deepEqual(s.sites.map((x) => x.id), ['perigny', 'perigny2', 'saintes']);

  // Périgny et Périgny II sont proches : même pôle. Saintes ne l'est pas.
  assert.equal(poleDuSite(s.sites, 'perigny'), poleDuSite(s.sites, 'perigny2'));
  assert.notEqual(poleDuSite(s.sites, 'perigny'), poleDuSite(s.sites, 'saintes'));
  assert.equal(siteById(s.sites, 'saintes').label, 'Saintes');
  assert.equal(siteById(s.sites, 'inconnu'), null);
  assert.equal(poleDuSite(s.sites, 'inconnu'), null);
});

// --- Ce qu'une zone admet -------------------------------------------------

test('zone : elle admet par code, ou par recommandation entière', () => {
  const s = etat();
  const mutu = s.zones.find((z) => z.id === 'z-mutu');
  const r482 = s.zones.find((z) => z.id === 'z-r482-1');

  assert.ok(admetDispositif(mutu, dispositif(s, 'R489-1A')), 'nommé par son code');
  assert.ok(!admetDispositif(mutu, dispositif(s, 'R489-3')), 'la Cat 3 n’est pas de cette zone');

  // Les zones de Périgny II admettent la R482 par recommandation : elles
  // fonctionneront le jour où les catégories seront créées, sans y revenir.
  assert.ok(admetDispositif(r482, { code: 'R482-A', reco: 'R482' }));
  assert.ok(admetDispositif(r482, { code: 'R482-G', reco: 'R482' }), 'même une catégorie pas encore créée');
  assert.ok(!admetDispositif(r482, dispositif(s, 'R489-3')));

  assert.ok(!admetDispositif(null, dispositif(s, 'R489-3')));
  assert.ok(!admetDispositif(mutu, null));
});

test('zone : la mutualisation R485 / R489 1A-1B découle du modèle', () => {
  const s = etat();
  // Une seule zone pour les quatre dispositifs, une session à la fois. Il n'y
  // a pas de règle « R485 et R489 1A jamais ensemble » : il n'y a qu'une zone.
  for (const code of ['R485-1', 'R485-2', 'R489-1A', 'R489-1B']) {
    const zones = zonesPour(s.zones, dispositif(s, code));
    assert.deepEqual(zones.map((z) => z.id), ['z-mutu'], `${code} n’a qu’une zone`);
    assert.equal(zones[0].sessions, 1);
  }
});

test('zone : les deux plateaux Cat 3/5 en parallèle découlent aussi', () => {
  const s = etat();
  for (const code of ['R489-3', 'R489-5']) {
    const zones = zonesPour(s.zones, dispositif(s, code));
    assert.deepEqual(zones.map((z) => z.id), ['z-35-1', 'z-35-2'], code);
    // Deux zones à UNE session, et non une zone à deux : on pourra déclarer
    // l'une indisponible sans toucher à l'autre.
    assert.deepEqual(zones.map((z) => z.sessions), [1, 1]);
  }
});

test('zone : Périgny II est dédié à la R482, et à rien d’autre', () => {
  const s = etat();
  const zonesP2 = s.zones.filter((z) => z.siteId === 'perigny2');
  assert.equal(zonesP2.length, 2);
  for (const z of zonesP2) {
    assert.deepEqual(z.recos, ['R482']);
    assert.deepEqual(z.dispositifs, []);
  }
  // Depuis le 06/10 la R482 est au catalogue : ces zones ont cessé d'être
  // vides. Et elles n'accueillent QUE la R482 — c'est le sens de « dédié ».
  const admises = s.formations.filter((f) => zonesPour(s.zones, f, 'perigny2').length);
  assert.deepEqual(admises.map((f) => f.code).sort(),
    ['R482-A', 'R482-B1', 'R482-C1', 'R482-F']);
});

test('site : une formation peut se tenir sur plusieurs sites', () => {
  const s = etat();
  // AIPR et habilitation électrique : Périgny ET Saintes.
  for (const code of ['AIPR', 'AIPR-FORM', 'HAB-ELEC']) {
    const sites = sitesPour(s.sites, s.zones, dispositif(s, code)).map((x) => x.id);
    assert.deepEqual(sites, ['perigny', 'saintes'], code);
  }
  // La R489 Cat 3, elle, n'est qu'à Périgny.
  assert.deepEqual(sitesPour(s.sites, s.zones, dispositif(s, 'R489-3')).map((x) => x.id), ['perigny']);
});

test('site : les deux modalités AIPR partagent la même zone', () => {
  const s = etat();
  // La zone admet la RECOMMANDATION : la seconde modalité, créée après elle,
  // y a sa place sans qu'on ait eu à la déclarer.
  const zonesSeule = zonesPour(s.zones, dispositif(s, 'AIPR')).map((z) => z.id);
  const zonesAvec = zonesPour(s.zones, dispositif(s, 'AIPR-FORM')).map((z) => z.id);
  assert.deepEqual(zonesSeule, zonesAvec);
  assert.deepEqual(zonesSeule, ['z-aipr-p', 'z-aipr-s']);
});

// --- Le matériel partagé --------------------------------------------------

test('matériel partagé : le porte-engin contraint désormais pour de bon', () => {
  const s = etat();
  const pe = s.ressources.find((r) => r.id === 'porte-engin');
  assert.ok(pe, 'le porte-engin est déclaré');
  assert.equal(pe.siteId, 'perigny2');
  assert.equal(pe.capacite, 1, 'un seul exemplaire, accessible des deux côtés');
  assert.deepEqual(pe.dispositifs, ['R482-A', 'R482-F']);

  // Il visait deux codes qui n'existaient pas : l'écran Paramètres le disait
  // « sans effet ». Les deux sont au catalogue depuis le 06/10, l'avertissement
  // n'a donc plus lieu d'être.
  assert.deepEqual(referencesInconnues(pe, s.formations), []);

  // Et la contrainte se joue à la JOURNÉE, pas au créneau : c'est le sens de
  // la réponse de Benoit, et c'est ce qui distingue ce matériel d'un plateau.
  assert.equal(pe.exclusifJour, true);

  // B1 et C1 ne sont pas concernées — elles tournent en parallèle d'une A.
  for (const code of ['R482-B1', 'R482-C1']) {
    assert.ok(!admetDispositif(pe, dispositif(s, code)), code);
  }
});

test('références inconnues : ce qui n’existe pas au catalogue est signalé', () => {
  const s = etat();
  // Plus aucune référence en attente : la R482 était la dernière, et son
  // arrivée au catalogue a éteint l'avertissement d'elle-même — personne n'a
  // eu à toucher aux zones ni au porte-engin. C'était l'intérêt de viser une
  // RECOMMANDATION plutôt que d'énumérer des codes.
  const enAttente = [...s.zones, ...s.ressources]
    .filter((p) => referencesInconnues(p, s.formations).length);
  assert.deepEqual(enAttente.map((p) => p.id), []);

  // Code comme recommandation sont repérés.
  assert.deepEqual(
    referencesInconnues({ dispositifs: ['R489-3', 'FANTOME'], recos: ['R489', 'R999'] }, s.formations),
    ['FANTOME', 'R999']);
});

// --- Reprise d'un état enregistré avant les sites -------------------------

test('reprise : un état sans sites reçoit le paramétrage livré', () => {
  const s = migrate({
    version: 1, params: {}, formations: [], team: [], openDays: [], inscriptions: [],
  });
  assert.equal(s.sites.length, 3);
  assert.equal(s.zones.length, 10);
  assert.equal(s.ressources.length, 1);
});

test('reprise : un paramétrage déjà saisi n’est pas écrasé', () => {
  // Même réduit à une seule zone, c'est un choix — et le remplacer par les dix
  // zones livrées ferait réapparaître des plateaux qu'on venait de retirer.
  const s = migrate({
    version: 1, params: {}, formations: [], team: [], openDays: [], inscriptions: [],
    sites: [{ id: 'unique', label: 'Site unique' }],
    zones: [{ id: 'z', siteId: 'unique', label: 'Zone' }],
    ressources: [],
  });
  assert.deepEqual(s.sites.map((x) => x.id), ['unique']);
  assert.deepEqual(s.zones.map((x) => x.id), ['z']);
  assert.deepEqual(s.ressources, []);

  // Champs absents normalisés : listes vides, une session, et un pôle qui vaut
  // le site lui-même — isolé, donc jamais enchaînable avec un autre. C'est
  // l'hypothèse prudente : elle ne fait rouler personne entre deux villes.
  assert.deepEqual(s.zones[0].dispositifs, []);
  assert.deepEqual(s.zones[0].recos, []);
  assert.equal(s.zones[0].sessions, 1);
  assert.equal(s.sites[0].pole, 'unique');
});

test('reprise : une session ou une capacité absurde est ramenée à 1', () => {
  const s = migrate({
    version: 1, params: {}, formations: [], team: [], openDays: [], inscriptions: [],
    sites: [{ id: 's', label: 'S', pole: 's' }],
    zones: [{ id: 'z', siteId: 's', label: 'Z', sessions: 0 }],
    ressources: [{ id: 'r', siteId: 's', label: 'R', capacite: -3 }],
  });
  // Zéro session ne veut pas dire « illimité » mais « zone inutilisable ».
  assert.equal(s.zones[0].sessions, 1);
  assert.equal(s.ressources[0].capacite, 1);
});

test('persistance : les trois collections sont enregistrées', () => {
  // Sans cela, tout le paramétrage vivrait dans le seul navigateur qui l'a
  // saisi — c'est exactement ainsi que « dayPresence » s'était perdu.
  for (const champ of ['sites', 'zones', 'ressources']) {
    assert.ok(PERSISTED_FIELDS.includes(champ), `${champ} doit être persisté`);
  }
});
