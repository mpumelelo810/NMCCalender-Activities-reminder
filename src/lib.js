// Pure scheduling and validation helpers, independent of Cloudflare APIs.
const DAY = 86400000;
const parse = s => { const [y,m,d]=s.split('-').map(Number); return Date.UTC(y,m-1,d); };
export const sastDate = now => new Date(now.getTime()+2*3600000).toISOString().slice(0,10);
export const addDays = (s,n) => new Date(parse(s)+n*DAY).toISOString().slice(0,10);
export const weekday = s => new Date(parse(s)).getUTCDay();
export const upcomingSaturday = s => addDays(s, weekday(s)===0 ? -1 : 6-weekday(s));
export const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s||'') && new Date(parse(s)).toISOString().slice(0,10)===s;
export const validTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s||'');
export function validateEvent(b={}) {
 const errors=[], str=(v,n)=>String(v??'').trim().slice(0,n);
 const allDay=b.all_day===true||b.all_day===1||b.all_day==='1'||b.all_day==='true'||b.all_day==='on';
 const value={title:str(b.title,120),date:str(b.date,10),start_time:allDay?'00:00':str(b.start_time,5),end_time:allDay?null:(str(b.end_time,5)||null),location:str(b.location,200),description:str(b.description,2000),category:b.category==='meeting'?'meeting':'activity',all_day:allDay?1:0,published:b.published?1:0,cancelled:b.cancelled?1:0};
 if(!value.title)errors.push('Enter a title.'); if(!validDate(value.date))errors.push('Enter a real date (YYYY-MM-DD).');
 if(!allDay&&!validTime(value.start_time))errors.push('Enter a start time like 14:30.'); if(!allDay&&value.end_time&&!validTime(value.end_time))errors.push('Enter an end time like 16:00, or leave it empty.');
 if(!allDay&&value.end_time&&validTime(value.start_time)&&value.end_time<=value.start_time)errors.push('End time must be after the start time.');
 return {ok:!errors.length,errors,value};
}
const line=e=>`${(e.all_day===1||e.all_day===true)?'':`${e.start_time}${e.end_time?'-'+e.end_time:''} `}${e.title}${e.location?' at '+e.location:''}${e.description?'\n  '+e.description:''}`;
const eligible=e=>e.published===1||e.published===true ? !(e.cancelled===1||e.cancelled===true) : false;
export function buildMessages(today,events) {
 const on=d=>events.filter(e=>eligible(e)&&e.date===d).sort((a,b)=>a.start_time.localeCompare(b.start_time));
 const out=[],tomorrow=addDays(today,1),daily=[...on(today).map(e=>'Today '+line(e)),...on(tomorrow).map(e=>'Tomorrow '+line(e))];
 if(daily.length)out.push({job:'daily',report_date:today,subject:`Youth activities: ${today}`,body:daily.join('\n')});
 if(weekday(today)===1){const sat=upcomingSaturday(today),list=on(sat);out.push({job:'monday_preview',report_date:today,subject:`This Saturday (${sat})`,body:list.length?list.map(line).join('\n'):`No activities are published for Saturday ${sat}.`});}
 const meetings=on(today).filter(e=>e.category==='meeting'); if(meetings.length)out.push({job:'meeting_agenda',report_date:today,subject:`Meeting today (${today})`,body:meetings.map(line).join('\n')});
 return out;
}
const b64=u=>btoa(String.fromCharCode(...u)),unb64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const pbkdf2=async(pw,salt)=>new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:100000},await crypto.subtle.importKey('raw',new TextEncoder().encode(pw),'PBKDF2',false,['deriveBits']),256));
export async function hashPassword(pw){const salt=crypto.getRandomValues(new Uint8Array(16));return `${b64(salt)}:${b64(await pbkdf2(pw,salt))}`;}
export async function verifyPassword(pw,stored){try{const [s,h]=String(stored).split(':');if(!s||!h)return false;const a=await pbkdf2(pw,unb64(s)),b=unb64(h);let d=a.length^b.length;for(let i=0;i<a.length;i++)d|=a[i]^(b[i]||0);return d===0;}catch{return false;}}
