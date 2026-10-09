import {validateEvent,sastDate,addDays,upcomingSaturday,buildMessages,verifyPassword} from './lib.js';
import {deliver} from './notify.js';
import {PAGE} from './page.js';
const now=()=>new Date().toISOString();
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store',...headers}});
const hex=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const cookie=(req,name)=>{const v=(req.headers.get('cookie')||'').split(/;\s*/).find(x=>x.startsWith(name+'='));return v?v.slice(name.length+1):null;};
async function admin(req,env){const t=cookie(req,'sid');if(!t||!/^[a-f0-9]{64}$/.test(t))return null;return env.DB.prepare('SELECT s.admin_id,a.phone,a.name,a.role FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>? AND a.active=1').bind(await hex(t),now()).first();}
async function audit(env,a,action,target){await env.DB.prepare('INSERT INTO audit(admin_id,action,target,at) VALUES(?,?,?,?)').bind(a,action,target,now()).run();}
async function loginThrottle(req,env){const ip=req.headers.get('cf-connecting-ip')||'unknown',key=await hex(ip),time=Date.now(),row=await env.DB.prepare('SELECT attempts,window_started_at FROM login_attempts WHERE key=?').bind(key).first();if(!row)return {key,blocked:false};const start=Date.parse(row.window_started_at);if(!Number.isFinite(start)||time-start>=15*60*1000)return {key,blocked:false};return {key,blocked:row.attempts>=5};}
async function recordLoginFailure(env,key){const t=now(),row=await env.DB.prepare('SELECT attempts,window_started_at FROM login_attempts WHERE key=?').bind(key).first();if(!row){await env.DB.prepare('INSERT INTO login_attempts(key,attempts,window_started_at) VALUES(?,1,?)').bind(key,t).run();return;}if(Date.now()-Date.parse(row.window_started_at)>=15*60*1000){await env.DB.prepare('UPDATE login_attempts SET attempts=1,window_started_at=? WHERE key=?').bind(t,key).run();}else{await env.DB.prepare('UPDATE login_attempts SET attempts=attempts+1 WHERE key=?').bind(key).run();}}
async function api(req,env,url){
 const p=url.pathname,m=req.method;
 if(p==='/api/events'&&m==='GET'){
  const q=url.searchParams.get('from')||sastDate(new Date()),from=/^\d{4}-\d{2}-\d{2}$/.test(q)?q:sastDate(new Date());
  const {results}=await env.DB.prepare('SELECT id,title,date,start_time,end_time,location,description,category FROM events WHERE published=1 AND cancelled=0 AND date>=? ORDER BY date,start_time LIMIT 200').bind(from).all();
  return json(results,200,{'cache-control':'public, max-age=60'});
 }
 if(m!=='GET'){
  if(!(req.headers.get('content-type')||'').toLowerCase().includes('application/json'))return json({error:'JSON required.'},415);
  const origin=req.headers.get('origin');if(origin&&origin!==url.origin)return json({error:'Forbidden.'},403);
 }
 if(p==='/api/login'&&m==='POST'){
  const throttle=await loginThrottle(req,env);if(throttle.blocked)return json({error:'Too many sign-in attempts. Wait 15 minutes and try again.'},429,{'retry-after':'900'});
  const b=await req.json().catch(()=>({})),phone=String(b.phone||'').trim().replace(/[\s()-]/g,''),password=String(b.password||'');
  const a=await env.DB.prepare('SELECT id,password_hash FROM admins WHERE phone=? AND active=1').bind(phone).first();
  if(!a||!(await verifyPassword(password,a.password_hash))){await recordLoginFailure(env,throttle.key);return json({error:'Wrong phone number or password.'},401);}
  await env.DB.prepare('DELETE FROM login_attempts WHERE key=?').bind(throttle.key).run();
  const t=[...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
  await env.DB.prepare('INSERT INTO sessions(token_hash,admin_id,expires_at) VALUES(?,?,?)').bind(await hex(t),a.id,new Date(Date.now()+12*3600000).toISOString()).run();
  return json({ok:true},200,{'set-cookie':`sid=${t}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`});
 }
 const who=await admin(req,env);if(!who)return json({error:'Sign in required.'},401);
 if(p==='/api/logout'&&m==='POST'){const t=cookie(req,'sid');if(t)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await hex(t)).run();return json({ok:true},200,{'set-cookie':'sid=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict'});}
 if(p==='/api/admin/events'&&m==='GET')return json((await env.DB.prepare('SELECT * FROM events ORDER BY date DESC,start_time LIMIT 500').all()).results);
 if(p==='/api/me'&&m==='GET')return json({phone:who.phone,name:who.name,role:who.role});
 if(p==='/api/admin/users'&&who.role!=='administrator')return json({error:'Administrator permission required.'},403);
 if(p==='/api/admin/users'&&m==='GET')return json((await env.DB.prepare('SELECT phone,name,role,active,created_at FROM admins ORDER BY role, name').all()).results);
 if(p==='/api/admin/users'&&m==='POST'){
  const b=await req.json().catch(()=>({})),phone=String(b.phone||'').trim().replace(/[\\s()-]/g,''),name=String(b.name||'').trim().slice(0,80);
  if(!/^\\+268[0-9]{7,9}$/.test(phone)||!name)return json({error:'Enter a valid Eswatini phone number and name.'},400);
  const {hashPassword}=await import('./lib.js'),password=phone.replace(/^\\+/,'')+'@'+name.toLowerCase().replace(/\\s+/g,'');
  const exists=await env.DB.prepare('SELECT id FROM admins WHERE phone=?').bind(phone).first();if(exists)return json({error:'That phone number already has an account.'},409);
  const t=now();await env.DB.prepare('INSERT INTO admins(id,email,phone,name,role,active,password_hash,created_at) VALUES(?,?,?,?,\'organiser\',1,?,?)').bind(phone,phone.replace(/[^0-9]/g,'')+'@nmcc.local',phone,name,await hashPassword(password),t).run();
  await audit(env,who.admin_id,'create_organiser',phone);return json({ok:true,phone,name,role:'organiser',passwordFormat:'phone number without +, followed by @ and the name without spaces'} ,201);
 }
 const userPath=p.match(/^\\/api\\/admin\\/users\\/(\\+268[0-9]{7,9})$/);
 if(userPath&&m==='PATCH'){
  const b=await req.json().catch(()=>({})),target=userPath[1];if(target===who.phone)return json({error:'You cannot deactivate your own account here.'},400);
  const active=b.active?1:0;const r=await env.DB.prepare('UPDATE admins SET active=? WHERE phone=? AND role=\'organiser\'').bind(active,target).run();if(!r.meta.changes)return json({error:'Organiser not found.'},404);
  if(!active)await env.DB.prepare('DELETE FROM sessions WHERE admin_id=?').bind(target).run();await audit(env,who.admin_id,active?'activate_organiser':'deactivate_organiser',target);return json({ok:true});
 }
 if(p==='/api/admin/runs'&&m==='GET')return json((await env.DB.prepare('SELECT id,job,report_date,subject,body,status,detail,created_at FROM notification_runs ORDER BY id DESC LIMIT 50').all()).results);
 if(p==='/api/admin/events'&&m==='POST'){
  const v=validateEvent(await req.json().catch(()=>({})));if(!v.ok)return json({errors:v.errors},400);const id=crypto.randomUUID(),e=v.value,t=now();
  await env.DB.prepare('INSERT INTO events(id,title,date,start_time,end_time,location,description,category,published,cancelled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,e.title,e.date,e.start_time,e.end_time,e.location,e.description,e.category,e.published,e.cancelled,t,t).run();
  await audit(env,who.admin_id,'create_event',id);return json({id},201);
 }
 const x=p.match(/^\/api\/admin\/events\/([0-9a-f-]{36})$/);
 if(x&&m==='PUT'){
  const v=validateEvent(await req.json().catch(()=>({})));if(!v.ok)return json({errors:v.errors},400);const e=v.value;
  const r=await env.DB.prepare('UPDATE events SET title=?,date=?,start_time=?,end_time=?,location=?,description=?,category=?,published=?,cancelled=?,updated_at=? WHERE id=?').bind(e.title,e.date,e.start_time,e.end_time,e.location,e.description,e.category,e.published,e.cancelled,now(),x[1]).run();
  if(!r.meta.changes)return json({error:'Not found.'},404);await audit(env,who.admin_id,'update_event',x[1]);return json({ok:true});
 }
 if(x&&m==='DELETE'){
  if((await req.json().catch(()=>({}))).confirm!==x[1])return json({error:'Explicit confirmation of this event ID is required.'},400);
  const r=await env.DB.prepare('DELETE FROM events WHERE id=?').bind(x[1]).run();if(!r.meta.changes)return json({error:'Not found.'},404);await audit(env,who.admin_id,'delete_event',x[1]);return json({ok:true});
 }
 return json({error:'Not found.'},404);
}
export async function runJobs(env,when){
 const today=sastDate(when),{results}=await env.DB.prepare('SELECT * FROM events WHERE date IN (?,?,?)').bind(today,addDays(today,1),upcomingSaturday(today)).all();
 for(const msg of buildMessages(today,results)){
  const ins=await env.DB.prepare("INSERT OR IGNORE INTO notification_runs(job,report_date,subject,body,status,created_at) VALUES(?,?,?,?,'generated',?)").bind(msg.job,msg.report_date,msg.subject,msg.body,now()).run();
  if(!ins.meta.changes)continue;
  let result;try{result=await deliver(env,msg);}catch(err){result={status:'failed',detail:String(err?.message||err).slice(0,300)};}
  await env.DB.prepare('UPDATE notification_runs SET status=?,detail=? WHERE job=? AND report_date=?').bind(result.status,result.detail,msg.job,msg.report_date).run();
 }
}
export default {
 async fetch(req,env){const url=new URL(req.url);try{return url.pathname.startsWith('/api/')?await api(req,env,url):new Response(PAGE,{headers:{'content-type':'text/html; charset=utf-8','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','x-frame-options':'DENY','content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});}catch(err){console.error('request_failed',String(err?.message||err));return json({error:'Something went wrong.'},500);}},
 async scheduled(event,env,ctx){ctx.waitUntil(runJobs(env,new Date(event.scheduledTime)));}
};
