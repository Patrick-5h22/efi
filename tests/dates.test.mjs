import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, workingDays, daySlots, addDays, dayOfWeek, mondayOf, fmtTime, parseTime, overlaps, semainesAffichees, fenetreAffichage, estJourOuvrable, SEMAINES_AFFICHEES, dateDuJour, semaineParDefaut } from '../js/dates.js';
import { DEFAULT_PARAMS } from '../js/config.js';

test('semaine ISO', () => {
  assert.equal(isoWeek('2026-09-01'), 36);
  assert.equal(isoWeek('2026-12-31'), 53);
  assert.equal(isoWeek('2026-01-01'), 1);
});

// Un jour est ouvrable s'il n'est ni week-end ni férié — la fenêtre
// d'affichage n'entre pas dans ce jugement.
//
// Régression : c'était la même notion. Une période bornée par deux dates
// réglées à la main décidait à la fois de ce qu'on affiche et de ce qui est
// tenable. Avancer le début de période au lundi de la semaine en cours faisait
// donc basculer en anomalie — « hors période ou jour non ouvré » — toutes les
// séances planifiées avant ce lundi, qui n'étaient pourtant que passées.
test('un jour ouvrable ne dépend pas de la fenêtre affichée', () => {
  assert.ok(estJourOuvrable(DEFAULT_PARAMS, '2026-09-08'), 'un mardi passé reste ouvrable');
  assert.ok(estJourOuvrable(DEFAULT_PARAMS, '2025-03-11'), 'même un an avant');
  assert.ok(estJourOuvrable(DEFAULT_PARAMS, '2028-03-14'), 'même deux ans après');
  assert.ok(!estJourOuvrable(DEFAULT_PARAMS, '2026-09-05'), 'samedi');
  assert.ok(!estJourOuvrable(DEFAULT_PARAMS, '2026-09-06'), 'dimanche');
  assert.ok(!estJourOuvrable(DEFAULT_PARAMS, '2026-11-11'), 'férié');
});

test('la fenêtre affichée : seize semaines depuis le lundi de la semaine en cours', () => {
  // Mercredi 16/09/2026, en S38. La fenêtre part du lundi 14.
  const f = fenetreAffichage('2026-09-16');
  assert.equal(f.debut, '2026-09-14', 'le lundi de la semaine en cours');
  assert.equal(f.fin, '2027-01-03', 'seize semaines plus tard, dimanche inclus');

  // Elle glisse : demain la même chose, lundi prochain d'une semaine.
  assert.equal(fenetreAffichage('2026-09-20').debut, '2026-09-14', 'le dimanche appartient encore à sa semaine');
  assert.equal(fenetreAffichage('2026-09-21').debut, '2026-09-21');

  const days = workingDays(DEFAULT_PARAMS, '2026-09-16');
  assert.equal(days.length, 78, '16 × 5 jours, moins les deux fériés de la fenêtre');
  assert.equal(days[0], '2026-09-14');
  assert.equal(days[days.length - 1], '2027-01-01');
  assert.ok(!days.includes('2026-11-11'));
  assert.ok(!days.includes('2026-12-25'));
  assert.ok(!days.includes('2026-09-19'), 'samedi');
  assert.ok(!days.includes('2026-09-08'), 'avant la fenêtre : ouvrable, mais pas affiché');
});

test('18 créneaux de 30 min entre 8h et 17h', () => {
  const slots = daySlots(DEFAULT_PARAMS);
  assert.equal(slots.length, 18);
  assert.equal(slots[0], 480);
  assert.equal(slots[slots.length - 1], 990);
});

test('jours et semaines', () => {
  assert.equal(dayOfWeek('2026-09-01'), 2); // mardi
  assert.equal(mondayOf('2026-09-01'), '2026-08-31');
  assert.equal(addDays('2026-08-31', 4), '2026-09-04');
  const weeks = semainesAffichees('2026-09-16');
  assert.equal(weeks.length, SEMAINES_AFFICHEES);
  assert.equal(weeks[0].week, 38, 'la semaine en cours ouvre la liste');
  assert.equal(weeks[0].monday, '2026-09-14');
  assert.equal(weeks[weeks.length - 1].week, 53);
  assert.equal(weeks[weeks.length - 1].monday, '2026-12-28');
  // Une semaine entièrement fériée compterait quand même : la liste est
  // comptée sur les lundis, pas sur les jours ouvrables.
  assert.deepEqual(weeks.map((w) => w.week).slice(0, 4), [38, 39, 40, 41]);
});

test('formats horaires', () => {
  assert.equal(fmtTime(480), '08:00');
  assert.equal(fmtTime(990), '16:30');
  assert.equal(parseTime('08:30'), 510);
  assert.equal(parseTime('8h30'), 510);
});

test('chevauchements', () => {
  assert.ok(overlaps(480, 570, 540, 600));
  assert.ok(!overlaps(480, 540, 540, 600));
});

// Une vue qui s'ouvre sans semaine demandée doit montrer la semaine EN COURS.
// Le défaut était « la première semaine qui porte une inscription » : les
// grilles s'ouvraient figées sur le passé, et il fallait cliquer autant de
// fois que de semaines écoulées pour revenir au présent.
test('semaine par défaut : celle d’aujourd’hui', () => {
  const weeks = semainesAffichees('2026-09-16');       // S38 → S53

  assert.equal(semaineParDefaut(weeks, '2026-09-16'), 38, 'mercredi de la S38');
  assert.equal(semaineParDefaut(weeks, '2026-09-20'), 38, 'le dimanche reste dans sa semaine');
  assert.equal(semaineParDefaut(weeks, '2026-09-21'), 39, 'lundi suivant');

  // Semaine absente de la liste : on prend la SUIVANTE, jamais une
  // précédente — le passé n'est pas un défaut acceptable.
  const trouees = weeks.filter((w) => w.week !== 38);
  assert.equal(semaineParDefaut(trouees, '2026-09-16'), 39);

  // Une liste qui commence après aujourd'hui (semaines consultables d'un
  // planning vide, par exemple) : la première.
  assert.equal(semaineParDefaut(weeks, '2026-01-05'), 38);
  // Et une liste entièrement passée : la dernière, jamais null.
  assert.equal(semaineParDefaut(weeks, '2027-06-01'), 53);

  assert.equal(semaineParDefaut([], '2026-09-16'), null, 'aucune semaine : rien à choisir');
});

// Le serveur tourne en UTC : passé minuit à Paris, un « aujourd'hui » déduit
// de toISOString rendrait la veille — et la portée « semaine » du tableau de
// bord pourrait basculer d'une semaine entière.
test('date du jour : heures locales du centre, pas UTC', () => {
  // 31/12/2026 23:30 UTC = 1er janvier 2027, 00:30 à Paris
  assert.equal(dateDuJour(new Date('2026-12-31T23:30:00Z')), '2027-01-01');
  // Et en heure d'été : 30/06 22:30 UTC = 1er juillet 00:30 à Paris (UTC+2)
  assert.equal(dateDuJour(new Date('2026-06-30T22:30:00Z')), '2026-07-01');
  // En pleine journée, aucune ambiguïté
  assert.equal(dateDuJour(new Date('2026-09-16T12:00:00Z')), '2026-09-16');
});
