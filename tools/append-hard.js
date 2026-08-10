'use strict';
/* 作った難しい面を、本編の後ろに簡単な順で足すツール。
 *
 *   node tools/append-hard.js <候補ファイル> [levels.json]
 *
 * 第502面以降に、やさしい順(手数の少ない順)で並べる。モデレーション用。
 * 足す前に1面ずつ解き直して、記録した手数と合うことを確かめる。
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const X=require(path.join(__dirname,'xsb.js'));
const MO=require(path.join(__dirname,'motif.js'));

const SRC=process.argv[2];
const TARGET=process.argv[3]||path.join(__dirname,'..','warehouse','levels.json');
if(!SRC){ console.error('使い方: node tools/append-hard.js <候補ファイル> [levels.json]'); process.exit(1); }

const cand=JSON.parse(fs.readFileSync(SRC,'utf8'));
const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));
const have=new Set(data.levels.map(l=>String(X.canonical(l.b.split('/')))));
const motifs=new Set();
for(const l of data.levels){ try{ motifs.add(MO.goalMotif(l.b)); }catch(e){} }

const ok=[];
let dup=0, bad=0;
for(const lv of cand){
  const key=String(X.canonical(lv.b.split('/')));
  if(have.has(key)){ dup++; continue; }
  // 解き直して検算
  const p=X.fromXSB(lv.b.split('/'));
  const t=E.solvableStates(p.grid,p.w,p.goals,3000000);
  const reg=E.regionRep(p.grid,p.w,new Set(p.boxes),p.player);
  const k=E.keyOf(p.boxes.slice().sort((a,b)=>a-b), reg.rep);
  if(!t||!t.has(k)||t.get(k)!==lv.p){
    bad++; console.log('  検算に落ちた: '+lv.id+' 記録'+lv.p+'手 / 実測'+(t&&t.has(k)?t.get(k):'解けない'));
    continue;
  }
  if(p.boxes.length!==p.goals.length){ bad++; console.log('  荷物と置き場の数が違う: '+lv.id); continue; }
  have.add(key);
  delete lv.boxes;
  ok.push(lv);
}

ok.sort((a,b)=>a.p-b.p||a.carry-b.carry);        // やさしい順
const from=data.levels.length+1;
ok.forEach((l,i)=>{ l.orig=from+i; data.levels.push(l); });
data.count=data.levels.length;
fs.writeFileSync(TARGET, JSON.stringify(data));

console.log(`\n候補${cand.length}件 → 重複${dup} 検算落ち${bad} 追加${ok.length}`);
console.log(`第${from}面〜第${data.count}面 (全${data.count}面)\n`);
console.log(' 面   手数 荷物  盤    経路  囮  強制  形');
ok.forEach((l,i)=>{
  const r=l.b.split('/');
  console.log(String(from+i).padStart(4)+String(l.p).padStart(6)+String(l.nbox||'-').padStart(4)
    +((r[0].length-2)+'x'+(r.length-2)).padStart(8)+String(l.mano).padStart(6)
    +String(l.dec).padStart(6)+String(l.fo).padStart(6)+'  '+l.sh);
});
