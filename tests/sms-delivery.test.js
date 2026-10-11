import test from 'node:test';
import assert from 'node:assert/strict';
import { deliver } from '../src/notify.js';

const message = {
  job: 'daily',
  report_date: '2026-10-11',
  subject: 'Youth activities: 2026-10-11',
  body: '🎉 Happy Birthday, Thandi! May God bless you with a beautiful year filled with love, joy, good health, and His grace. May He guide your steps and remind you how deeply you are loved by your NMC Youth family. Enjoy your special day! 💚🎂'
};
function mockDb() {
  const calls = [];
  return { calls, prepare(sql) { return { bind(...values) {
    return { async first() { calls.push({kind:'first',sql,values}); return null; },
      async run() { calls.push({kind:'run',sql,values}); return {meta:{changes:1}}; } };
  } }; } };
}
test('SMS stays disabled until an explicit provider is configured', async () => {
  const result = await deliver({ NOTIFY_PROVIDER: 'none' }, message);
  assert.equal(result.status, 'generated');
  assert.match(result.detail, /not been enabled/i);
});
test('SMS reports missing Twilio setup without making a network request', async () => {
  const originalFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('unexpected network request'); };
  try {
    const result = await deliver({ NOTIFY_PROVIDER: 'twilio_sms' }, message);
    assert.equal(result.status, 'failed');
    assert.match(result.detail, /TWILIO_ACCOUNT_SID/);
    assert.equal(called, false);
  } finally { globalThis.fetch = originalFetch; }
});
test('SMS sends a short plain-text reminder and records provider acceptance', async t => {
  const originalFetch = globalThis.fetch;
  const db = mockDb();
  let request;
  globalThis.fetch = async (url, options) => {
    request = {url,options};
    return {ok:true,status:201,json:async()=>({sid:'SMtest123',status:'queued'})};
  };
  t.after(() => { globalThis.fetch = originalFetch; });
  const env = {
    NOTIFY_PROVIDER:'twilio_sms', TWILIO_ACCOUNT_SID:'AC'+'a'.repeat(32),
    TWILIO_AUTH_TOKEN:'test-token', TWILIO_FROM_NUMBER:'+15551234567',
    SMS_RECIPIENTS:'+268 7665 7261', DB:db
  };
  const result = await deliver(env,message);
  assert.equal(result.status,'sent');
  assert.match(result.detail,/Twilio accepted/i);
  assert.equal(request.url,'https://api.twilio.com/2010-04-01/Accounts/'+env.TWILIO_ACCOUNT_SID+'/Messages.json');
  assert.match(request.options.headers.authorization,/^Basic /);
  const form = new URLSearchParams(request.options.body);
  assert.equal(form.get('To'),'+26876657261');
  assert.ok(form.get('Body').includes('Birthday today: Thandi'));
  assert.ok(form.get('Body').length<=150);
  assert.ok(!/[^\x20-\x7E]/.test(form.get('Body')));
  assert.ok(db.calls.some(call=>call.sql.includes('INSERT INTO notification_deliveries')));
  assert.ok(db.calls.some(call=>call.sql.includes("UPDATE notification_deliveries SET status='sent'")));
});
