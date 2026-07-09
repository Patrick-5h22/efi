import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isoWeek, workingDays, daySlots, addDays, dayOfWeek, mondayOf, fmtTime, parseTime, overlaps, periodWeeks } from '../js/dates.js';
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
