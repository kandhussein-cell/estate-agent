import test from 'node:test';
import assert from 'node:assert/strict';
import './helpers.js';
import { scoreLead } from '../core/scoring.js';

test('empty lead is cold with score 0', () => {
  const r = scoreLead({ areas: [] }, {});
  assert.equal(r.score, 0);
  assert.equal(r.temperature, 'cold');
});

test('fully qualified lead with a booked viewing is hot', () => {
  const r = scoreLead({ intent: 'buy', budget: 300000, areas: ['Achrafieh'], timeline: 'this month', phone: '+9613123456' }, { userMessages: 6, hasViewing: true, areaMatches: 3, fastReplies: true });
  assert.ok(r.score >= 85, `score ${r.score}`);
  assert.equal(r.temperature, 'hot');
});

test('weights: budget 20, urgent timeline 20, area 15, viewing 25, phone 10', () => {
  assert.equal(scoreLead({ intent: 'rent', budget: 500, areas: [] }).breakdown.budget, 20);
  assert.equal(scoreLead({ timeline: 'asap', areas: [] }).breakdown.timeline, 20);
  assert.equal(scoreLead({ timeline: 'just looking', areas: [] }).breakdown.timeline, 4);
  assert.equal(scoreLead({ areas: ['Hamra'] }, { areaMatches: 2 }).breakdown.area, 15);
  assert.equal(scoreLead({ areas: ['Hamra'] }, { areaMatches: 0 }).breakdown.area, 6);
  assert.equal(scoreLead({ areas: [] }, { hasViewing: true }).breakdown.viewing, 25);
  assert.equal(scoreLead({ phone: '+9613', areas: [] }).breakdown.phone, 10);
});

test('score is bounded 0..100 and grows as information is added', () => {
  const a = scoreLead({ intent: 'rent', areas: [] }, { userMessages: 1 }).score;
  const b = scoreLead({ intent: 'rent', budget: 600, areas: ['Hadath'] }, { userMessages: 3, areaMatches: 2 }).score;
  assert.ok(b > a);
  assert.ok(scoreLead({ intent: 'rent', budget: 1, areas: ['x'], timeline: 'asap', phone: '1', viewing_requested: true }, { userMessages: 99, hasViewing: true, areaMatches: 1, fastReplies: true }).score <= 100);
});

test('temperature thresholds', () => {
  assert.equal(scoreLead({ intent: 'rent', budget: 1, areas: [] }).temperature, 'cold');
  assert.equal(scoreLead({ intent: 'rent', budget: 1, areas: ['Hamra'], timeline: 'next month' }, { areaMatches: 1 }).temperature, 'warm');
});
