import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, workingDays, daySlots, addDays, dayOfWeek, mondayOf, fmtTime, parseTime, overlaps, periodWeeks, dateDuJour, semaineParDefaut } from '../js/dates.js';
import { DEFAULT_PARAMS } from '../js/config.js';

test('semaine ISO', () => {
  assert.equal(isoWeek('2026-09-01'), 36);
  assert.equal(isoWeek('2026-12-31'), 53);
  assert.equal(isoWeek('2026-01-01'), 1);
});

test('86 jours ouvrés sur la période (fériés 11/11 et 25/12 exclus)', () => {
  const days = workingDays(DEFAULT_PARAMS);
  assert.equal(days.length, 86);
  assert.ok(!days.includes('2026-11-11'));
  assert.ok(!days.includes('2026-12-25'));
  assert.ok(!days.includes('2026-09-05')); // samedi
  assert.equal(days[0], '2026-09-01');
  assert.equal(days[days.length - 1], '2026-12-31');
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
  const weeks = periodWeeks(DEFAULT_PARAMS);
  assert.equal(weeks[0].week, 36);
  assert.equal(weeks[weeks.length - 1].week, 53);
  assert.equal(weeks.length, 18);
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
test('semaine par défaut : celle d’aujourd’hui, bornée à la période', () => {
  const weeks = periodWeeks(DEFAULT_PARAMS);           // S36 → S53, sept. → déc. 2026

  assert.equal(semaineParDefaut(DEFAULT_PARAMS, weeks, '2026-09-16'), 38, 'mercredi de la S38');
  assert.equal(semaineParDefaut(DEFAULT_PARAMS, weeks, '2026-09-20'), 38, 'le dimanche reste dans sa semaine');
  assert.equal(semaineParDefaut(DEFAULT_PARAMS, weeks, '2026-12-28'), 53, 'dernière semaine de la période');

  // Hors période : avant, la première ; après, la dernière. Jamais de null,
  // une vue doit toujours avoir quelque chose à afficher.
  assert.equal(semaineParDefaut(DEFAULT_PARAMS, weeks, '2026-01-05'), 36);
  assert.equal(semaineParDefaut(DEFAULT_PARAMS, weeks, '2027-03-01'), 53);

  // Semaine absente de la liste (fermée) : on prend la SUIVANTE, jamais une
  // précédente — le passé n'est pas un défaut acceptable.
  const trouees = weeks.filter((w) => w.week !== 38);
  assert.equal(semaineParDefaut(DEFAULT_PARAMS, trouees, '2026-09-16'), 39);

  assert.equal(semaineParDefaut(DEFAULT_PARAMS, [], '2026-09-16'), null, 'aucune semaine : rien à choisir');
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
