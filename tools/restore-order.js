'use strict';
/* 怪しい順に組み替えた並びを、元の面番号どおりに戻すツール。
 *   node tools/restore-order.js [levels.json]
 */
const fs=require('fs');
const path=require('path');
const TARGET=process.argv[2]||path.join(__dirname,'..','warehouse','levels.json');
const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));
if(!data.levels.every(l=>l.orig!==undefined)){
  console.error('元の面番号(orig)を持っていない面があります。戻せません。');
  process.exit(1);
}
data.levels.sort((a,b)=>a.orig-b.orig);
delete data.reordered;
data.count=data.levels.length;
fs.writeFileSync(TARGET, JSON.stringify(data));
console.log('元の並びに戻しました (全'+data.count+'面)');
