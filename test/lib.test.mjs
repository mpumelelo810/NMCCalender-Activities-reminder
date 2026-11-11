import {test} from 'node:test';import assert from 'node:assert/strict';
import {sastDate,upcomingSaturday,buildMessages,validateEvent,hashPassword,verifyPassword} from '../src/lib.js';
const ev=o=>({title:'T',start_time:'10:00',end_time:null,location:'Hall',description:'',category:'activity',published:1,cancelled:0,...o});
test('05:00 UTC is 07:00 SAST and rolls date correctly',()=>{assert.equal(sastDate(new Date('2026-10-04T22:30:00Z')),'2026-10-05');assert.equal(sastDate(new Date('2026-10-05T05:00:00Z')),'2026-10-05');});
test('upcoming Saturday handles month and year boundaries',()=>{assert.equal(upcomingSaturday('2026-10-05'),'2026-10-10');assert.equal(upcomingSaturday('2026-03-30'),'2026-04-04');assert.equal(upcomingSaturday('2026-12-28'),'2027-01-02');});
test('Monday preview includes all eligible Saturday events only',()=>{const m=buildMessages('2026-10-05',[ev({date:'2026-10-10',title:'A'}),ev({date:'2026-10-10',title:'B',start_time:'08:00'}),ev({date:'2026-10-10',title:'Hidden',published:0}),ev({date:'2026-10-10',title:'Off',cancelled:1}),ev({date:'2026-10-11',title:'Sunday'})]);const p=m.find(x=>x.job==='monday_preview');assert.match(p.body,/B[\s\S]*A/);assert.doesNotMatch(p.body,/Hidden|Off|Sunday/);});
test('empty Saturday still previews; empty daily is skipped',()=>{assert.match(buildMessages('2026-10-05',[]).find(x=>x.job==='monday_preview').body,/No activities/);assert.equal(buildMessages('2026-10-05',[]).filter(x=>x.job==='daily').length,0);});
test('meeting agenda overlaps safely with Monday and daily jobs',()=>{const m=buildMessages('2026-10-05',[ev({date:'2026-10-05',category:'meeting',title:'Committee'}),ev({date:'2026-10-05',category:'meeting',title:'Draft',published:0}),ev({date:'2026-10-05',category:'meeting',title:'Gone',cancelled:1}),ev({date:'2026-10-05',title:'Practice'})]);assert.deepEqual(m.map(x=>x.job).sort(),['daily','meeting_agenda','monday_preview']);assert.match(m.find(x=>x.job==='meeting_agenda').body,/Committee/);});
test('event validation rejects malformed values',()=>{assert.equal(validateEvent({title:'x',date:'2026-02-30',start_time:'10:00'}).ok,false);assert.equal(validateEvent({title:'',date:'2026-02-20',start_time:'10:00'}).ok,false);assert.equal(validateEvent({title:'x',date:'2026-02-20',start_time:'25:00'}).ok,false);assert.equal(validateEvent({title:'x',date:'2026-02-20',start_time:'10:00',end_time:'09:00'}).ok,false);assert.equal(validateEvent({title:'x',date:'2026-02-20',start_time:'10:00'}).ok,true);});
test('password hashing verifies only the right password',async()=>{const h=await hashPassword('correct horse battery');assert.equal(await verifyPassword('correct horse battery',h),true);assert.equal(await verifyPassword('wrong',h),false);});

test('event type validation supports birthdays, sessions and committee meetings',()=>{
 for(const type of ['birthday','activity','meeting']){
  const result=validateEvent({title:'Test event',date:'2026-02-20',start_time:'10:00',event_type:type});
  assert.equal(result.ok,true);
  assert.equal(result.value.event_type,type);
 }
 assert.equal(validateEvent({title:'Test',date:'2026-02-20',start_time:'10:00',event_type:'unknown'}).value.event_type,'activity');
});
test('birthday and committee meeting reminders use explicit event types',()=>{
 const events=[ev({date:'2026-10-05',title:'Mpumelelo',event_type:'birthday'}),ev({date:'2026-10-05',title:'Planning',event_type:'meeting',category:'meeting'}),ev({date:'2026-10-05',title:'Bible study',event_type:'activity'})];
 const messages=buildMessages('2026-10-05',events);
 assert.match(messages.find(x=>x.job==='daily').body,/Happy Birthday, Mpumelelo/);
 assert.match(messages.find(x=>x.job==='meeting_agenda').body,/Planning/);
 assert.doesNotMatch(messages.find(x=>x.job==='meeting_agenda').body,/Bible study/);
});
