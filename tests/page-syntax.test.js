import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE } from '../src/page.js';

test('the calendar page inline JavaScript parses successfully', () => {
  const scripts = [...PAGE.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .filter(Boolean);

  assert.ok(scripts.length > 0, 'Expected at least one inline browser script');
  for (const script of scripts) {
    assert.doesNotThrow(() => new Function(script));
  }
  assert.doesNotMatch(PAGE, /\}\\nlet events=/, 'Do not leave a literal backslash-n between page functions');
});
