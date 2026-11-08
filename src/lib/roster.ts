import type {Attendee} from './model.ts';
export type RosterFilter='all'|'pending'|'signed';
export function filterAttendees(rows:Attendee[],query:string,status:RosterFilter){
 const search=query.trim().toLocaleLowerCase();
 return rows.filter(row=>row.name.toLocaleLowerCase().includes(search)&&(status==='all'||(status==='signed'?Boolean(row.checked_in_at):!row.checked_in_at)));
}
function beijingMinute(value:string){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(value));
 const field=(type:string)=>parts.find(p=>p.type===type)?.value;
 return `${field('year')}-${field('month')}-${field('day')} ${field('hour')}:${field('minute')}`;
}
function csvCell(value:string){
 // A quoted CSV cell can still execute as a spreadsheet formula.
 const safe=/^[\s\u0000-\u001f]*[=+@-]/.test(value)?"'"+value:value;
 return '"'+safe.replaceAll('"','""')+'"';
}
export function rosterCsv(rows:Attendee[]){
 const header='姓名,报名时间（北京时间）,签到状态,签到时间（北京时间）';
 return '\ufeff'+[header,...rows.map(row=>[row.name,beijingMinute(row.registered_at),row.checked_in_at?'已签到':'未签到',row.checked_in_at?beijingMinute(row.checked_in_at):''].map(csvCell).join(','))].join('\r\n')+'\r\n';
}
