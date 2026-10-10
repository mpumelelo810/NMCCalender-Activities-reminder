import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { PAGE } from '../src/page.js';

test('the calendar page inline JavaScript parses successfully', () => {
  const scripts = [...PAGE.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)]
    .map(match => match[1])
    .filter(Boolean);

  assert.ok(scripts.length > 0, 'Expected at least one inline browser script');
  for (const [index, script] of scripts.entries()) {
    try {
      new vm.Script(script, { filename: 'calendar-inline-' + index + '.js' });
    } catch (error) {
      assert.fail('Inline script failed to parse: ' + error.stack + '\\nNearby source: ' + script.slice(0, 1000));
    }
  }
  assert.doesNotMatch(PAGE, /\\}\\\\nlet events=/, 'Do not leave a literal backslash-n between page functions');
});
