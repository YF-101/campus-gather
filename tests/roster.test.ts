import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterAttendees,rosterCsv} from '../src/lib/roster.ts';
const rows=[
 {user_id:'private-id-a',name:'林同学',registered_at:'2026-11-08T02:00:00Z',checked_in_at:null},
 {user_id:'private-id-b',name:'Alice 同学',registered_at:'2026-11-08T03:00:00Z',checked_in_at:'2026-11-08T04:00:00Z'},
];
test('roster search and status filters compose without mutating the authorized list',()=>{
 assert.equal(filterAttendees(rows,' ALICE ','signed').length,1);
 assert.equal(filterAttendees(rows,'林','pending').length,1);
 assert.equal(filterAttendees(rows,'林','signed').length,0);
 assert.equal(filterAttendees(rows,'','all').length,2);
 assert.equal(rows.length,2);
});
test('CSV exports Chinese names with BOM and Beijing times, without internal IDs',()=>{
 const csv=rosterCsv(rows);
 assert.ok(csv.startsWith('\ufeff'));assert.match(csv,/姓名,报名时间（北京时间）,签到状态,签到时间（北京时间）/);
 assert.match(csv,/2026-11-08 10:00/);assert.match(csv,/未签到/);assert.match(csv,/已签到/);
 assert.doesNotMatch(csv,/private-id|user_id/);
});
test('CSV protects spreadsheet formulas and escapes embedded commas, quotes and newlines',()=>{
 const csv=rosterCsv(['=HYPERLINK("bad")','  +SUM(1,2)','@danger','-42','\t=formula','正常,"名字"\n第二行'].map(name=>({...rows[0],name})));
 assert.match(csv,/"'=HYPERLINK\(""bad""\)"/);assert.match(csv,/"'  \+SUM\(1,2\)"/);
 assert.match(csv,/"'@danger"/);assert.match(csv,/"'-42"/);assert.match(csv,/"'\t=formula"/);
 assert.match(csv,/"正常,""名字""\n第二行"/);
});
