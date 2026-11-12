import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { PAGE } from '../src/page.js';

test('the calendar page inline JavaScript parses successfully', () => {
  const scripts = [...PAGE.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(match => match[1])
    .filter(Boolean);

  assert.ok(scripts.length > 0, 'Expected at least one inline browser script');
  for (const [index, script] of scripts.entries()) {
    try {
      new vm.Script(script, { filename: 'calendar-inline-' + index + '.js' });
    } catch (error) {
      assert.fail('Inline script failed to parse: ' + error.stack + '\nNearby source: ' + script.slice(0, 1000));
    }
  }
});

test('the monthly calendar is displayed before the upcoming events list', () => {
  const calendar = PAGE.indexOf('app.innerHTML=monthNotice+renderMonth(monthEvents)');
  const upcoming = PAGE.indexOf('Next 6 upcoming events', calendar);
  assert.ok(calendar >= 0, 'Expected the month calendar to render first');
  assert.ok(upcoming > calendar, 'Expected upcoming events underneath the month calendar');
  assert.doesNotMatch(PAGE, /calendar-panel\\{order:-1\\}/);
});

test('the static homepage stays in sync with the Worker calendar page', async () => {
  const { readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const assetPath = fileURLToPath(new URL('../public/index.html', import.meta.url));
  const asset = await readFile(assetPath, 'utf8');
  assert.equal(asset, PAGE, 'public/index.html must match the Worker PAGE source');
});

test('public calendar shows a 24-hour recent-updates feed', () => {
  assert.match(PAGE, /Updates in the last 24 hours/);
  assert.match(PAGE, /api\('\/updates'\)/);
  assert.match(PAGE, /Recently added or edited activities/);
});

test('admin event actions use robust delegated button handling', () => {
  assert.match(PAGE, /e\.target\.closest\('button\[data-user\]/);
  assert.match(PAGE, /data-edit=/);
  assert.match(PAGE, /data-pub=/);
  assert.match(PAGE, /type="button" class="btn secondary" data-edit=/);
  assert.match(PAGE, /type="button" class="btn secondary" data-pub=/);
});
