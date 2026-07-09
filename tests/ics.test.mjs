import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultState, seedExamples } from '../js/store.js';
import { computeSchedule } from '../js/engine.js';
import { buildICS } from '../js/ics.js';

test('export ICS : événements pratiques, tests et théorie', () => {
  const state = seedExamples(defaultState());
  const ics = buildICS(state, computeSchedule(state));
  assert.ok(ics.startsWith('BEGIN:VCALENDAR'));
  assert.ok(ics.includes('SUMMARY:Formation R489 Cat 1A — EXEMPLE - DUPONT Jean'));
  assert.ok(ics.includes('SUMMARY:Test pratique R489 Cat 3 — EXEMPLE - MARTIN Claire'));
  assert.ok(ics.includes('SUMMARY:Test théorique — 2 candidat(s)'));
  assert.ok(ics.includes('DTSTART;TZID=Europe/Paris:20260901T080000'));
  // 4 pratiques + 3 tests + 1 théorie = 8 événements
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 8);
});
