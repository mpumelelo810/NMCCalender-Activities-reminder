import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');

test('audit history endpoint is authenticated and includes organiser names and details', () => {
  assert.match(source, /p==='\/api\/admin\/activity-log'&&m==='GET'/);
  assert.match(source, /LEFT JOIN admins u ON u\.id=a\.admin_id/);
  assert.match(source, /LEFT JOIN events e ON e\.id=a\.target/);
  assert.match(source, /a\.details/);
});

test('event changes are recorded with field-level before and after values', () => {
  assert.match(source, /eventChangeFields\.filter/);
  assert.match(source, /changes:\[\{field:'Title'/);
  assert.match(source, /Public status/);
  assert.match(source, /details\?JSON\.stringify\(details\):null/);
});

test('publish and unpublish audit records include the activity title and date', () => {
  assert.match(source, /SELECT id,published,title,date FROM events WHERE id=\?/);
  assert.match(source, /title:prior\.title,date:prior\.date/);
});
