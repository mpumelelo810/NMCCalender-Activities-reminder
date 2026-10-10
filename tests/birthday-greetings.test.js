import test from 'node:test';
import assert from 'node:assert/strict';
import { birthdayMessage, buildMessages, isBirthdayEvent } from '../src/lib.js';

test('personal names are treated as birthday entries, not regular activities', () => {
  assert.equal(isBirthdayEvent({ title: 'Minenhle', category: 'activity' }), true);
  assert.equal(isBirthdayEvent({ title: 'Babe Dlamini', category: 'activity' }), true);
  assert.equal(isBirthdayEvent({ title: 'Lisango & Liguma', category: 'activity' }), true);
  assert.equal(isBirthdayEvent({ title: 'Sports Day', category: 'activity' }), false);
  assert.equal(isBirthdayEvent({ title: 'Committee Meeting', category: 'meeting' }), false);
});

test('birthday message is warm and personalised', () => {
  const message = birthdayMessage('Minenhle');
  assert.match(message, /Happy Birthday, Minenhle/);
  assert.match(message, /NMC Youth family/);
});

test('daily reminders include the personalised birthday greeting on the birthday date', () => {
  const messages = buildMessages('2026-10-01', [
    { title: 'Ayabonga', date: '2026-10-01', start_time: '00:00', category: 'activity', published: 1, cancelled: 0 }
  ]);
  assert.equal(messages.length, 1);
  assert.match(messages[0].body, /Happy Birthday, Ayabonga/);
  assert.match(messages[0].body, /NMC Youth family/);
});
