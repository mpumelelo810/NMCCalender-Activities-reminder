import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/worker.js', import.meta.url), 'utf8');

test('public updates endpoint only exposes currently published, non-cancelled events changed within 24 hours', () => {
  assert.match(source, /p==='\/api\/updates'&&m==='GET'/);
  assert.match(source, /Date\.now\(\)-24\*60\*60\*1000/);
  assert.match(source, /WHERE published=1 AND cancelled=0 AND \(created_at>=\? OR updated_at>=\?\)/);
  assert.match(source, /CASE WHEN created_at>=\? THEN 'Added' ELSE 'Updated' END AS change_type/);
});

test('event edits merge supplied fields with the stored event and record publish state changes', () => {
  assert.match(source, /const body=\{\.\.\.prior,\.\.\.supplied\}/);
  assert.match(source, /'unpublish_event'/);
  assert.match(source, /'publish_event'/);
});
