'use strict';
/* 取っておいた面を、いまの面リストに挿し戻すツール。
 *
 *   node tools/restore-levels.js <控えのjson> <戻す面番号,...> [levels.json]
 *
 * 面番号は「控えの中での位置」。差し替えではなく挿入なので、総数はそのぶん増える。
 * すでに同じ盤が入っている面は飛ばす。
 */
const fs=require('fs');
const path=require('path');
const X=require(path.join(__dirname,'xsb.js'));

const BACKUP=process.argv[2];
const STAGES=(process.argv[3]||'').split(',').map(Number).filter(n=>n>=1);
const TARGET=process.argv[4]||path.join(__dirname,'..','warehouse','levels.json');
if(!BACKUP||!STAGES.length){
  console.error('使い方: node tools/restore-levels.js <控えのjson> <面番号,...> [levels.json]');
  process.exit(1);
}

const backup=JSON.parse(fs.readFileSync(BACKUP,'utf8')).levels;
const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));
const have=new Set(data.levels.map(l=>X.canonical(l.b.split('/'))));

const before=data.levels.length;
// 後ろから挿すと、前の面の位置がずれない
const list=STAGES.slice().sort((a,b)=>b-a);
let done=0, skipped=0;
for(const s of list){
  const lv=backup[s-1];
  if(!lv){ console.log(`× 控えに第${s}面がありません`); continue; }
  if(have.has(X.canonical(lv.b.split('/')))){ console.log(`= 第${s}面はすでに入っています`); skipped++; continue; }
  have.add(X.canonical(lv.b.split('/')));
  data.levels.splice(Math.min(s-1, data.levels.length), 0, lv);
  done++;
}
data.count=data.levels.length;
fs.writeFileSync(TARGET, JSON.stringify(data));
console.log(`\n${done}面を戻しました (既存 ${skipped}面) / ${before}面 → ${data.levels.length}面`);
