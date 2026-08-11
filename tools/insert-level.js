'use strict';
/* 編集した盤を、指定の面に差し込むツール(上書きではなく挿入)。
 *
 *   node tools/insert-level.js <編集ファイル> <入れる面番号> [levels.json]
 *
 * 入れる前に解き直して、記録の手数と合うことを確かめる。
 * 以降の面番号はひとつずつ後ろへずれる。
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {greedyPolicies, analyse, mulberry32, regionRep, solvableStates, keyOf}=E;
const X=require(path.join(__dirname,'xsb.js'));

const SRC=process.argv[2];
const AT=+process.argv[3];
const TARGET=process.argv[4]||path.join(__dirname,'..','warehouse','levels.json');
if(!SRC||!(AT>=1)){ console.error('使い方: node tools/insert-level.js <編集ファイル> <面番号> [levels.json]'); process.exit(1); }

const src=JSON.parse(fs.readFileSync(SRC,'utf8'));
const item=Array.isArray(src)?src[0]:src;
const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));

const p=X.fromXSB(item.b.split('/'));
if(p.boxes.length!==p.goals.length){ console.error('荷物と置き場の数が違います'); process.exit(1); }
const table=solvableStates(p.grid,p.w,p.goals,3000000);
const reg=regionRep(p.grid,p.w,new Set(p.boxes),p.player);
const k0=keyOf(p.boxes.slice().sort((a,b)=>a-b), reg.rep);
if(!table||!table.has(k0)){ console.error('解けません'); process.exit(1); }
const pushes=table.get(k0);
if(item.p && item.p!==pushes){ console.error(`手数が合いません: 記録${item.p} / 実測${pushes}`); process.exit(1); }

const key=String(X.canonical(item.b.split('/')));
const same=data.levels.findIndex(l=>String(X.canonical(l.b.split('/')))===key);
if(same>=0){ console.error('同じ盤が第'+(same+1)+'面にあります'); process.exit(1); }

const rng=mulberry32(20260811);
const a=analyse(p.grid,p.w,p.goals,table,{boxes:p.boxes,rep:reg.rep,cells:reg.cells},rng,
                greedyPolicies(p.grid,p.w,p.goals));
const lv={
  id:X.hashId(X.canonical(item.b.split('/'))), b:item.b, p:pushes,
  s:+a.score.toFixed(1), k:+a.score.toFixed(1),
  tr:Math.round(a.trapRatio*100), f:a.forced, g:a.greedyDied, og:a.offGoal?1:0,
  sh:item.sh||'手作り', handmade:1, st:table.size,
};
data.levels.splice(AT-1, 0, lv);
data.levels.forEach((l,i)=>{ l.orig=i+1; });
data.count=data.levels.length;
fs.writeFileSync(TARGET, JSON.stringify(data));

console.log(`第${AT}面に入れました (最短${pushes}手 / 荷物${p.boxes.length}個)`);
console.log(lv.b.split('/').join('\n'));
console.log(`\n全${data.count}面。第${AT}面より後ろは1つずつ後ろへずれました。`);
