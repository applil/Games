'use strict';
/* 難しい面を選んで後半に足し、その区間を手数順に並べ直すツール。
 *
 *   node tools/append-sorted.js <候補ファイル> <足す数> <並べ直す開始面> [levels.json]
 *
 * 足す前に1面ずつ解き直して検算する。
 * 型が偏らないよう、珍しい型（順番型など）を先に取ってから手数で散らす。
 */
const fs=require('fs');
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const X=require(path.join(__dirname,'xsb.js'));
const MO=require(path.join(__dirname,'motif.js'));

const SRC=process.argv[2];
const WANT=+process.argv[3];
const FROM=+process.argv[4];
const TARGET=process.argv[5]||path.join(__dirname,'..','warehouse','levels.json');
if(!SRC||!(WANT>0)||!(FROM>0)){
  console.error('使い方: node tools/append-sorted.js <候補> <足す数> <並べ直す開始面> [levels.json]');
  process.exit(1);
}

const cand=JSON.parse(fs.readFileSync(SRC,'utf8'));
const data=JSON.parse(fs.readFileSync(TARGET,'utf8'));
const have=new Set(data.levels.map(l=>String(X.canonical(l.b.split('/')))));
const motifs=new Set();
for(const l of data.levels){ try{ motifs.add(MO.goalMotif(l.b)); }catch(e){} }

// 検算
const ok=[];
let dup=0, bad=0;
for(const lv of cand){
  const key=String(X.canonical(lv.b.split('/')));
  if(have.has(key)){ dup++; continue; }
  const p=X.fromXSB(lv.b.split('/'));
  if(p.boxes.length!==p.goals.length){ bad++; continue; }
  const t=E.solvableStates(p.grid,p.w,p.goals,3000000);
  const reg=E.regionRep(p.grid,p.w,new Set(p.boxes),p.player);
  const k=E.keyOf(p.boxes.slice().sort((a,b)=>a-b), reg.rep);
  if(!t||!t.has(k)||t.get(k)!==lv.p){
    bad++; console.log('  検算に落ちた: '+lv.id+' 記録'+lv.p+'手 / 実測'+(t&&t.has(k)?t.get(k):'解けない'));
    continue;
  }
  const mo=MO.goalMotif(lv.b);
  if(motifs.has(mo)){ dup++; continue; }
  have.add(key); motifs.add(mo);
  delete lv.boxes;
  ok.push(lv);
}
console.log(`候補${cand.length}件 → 重複${dup} 検算落ち${bad} 使える${ok.length}件`);

// 珍しい型を優先し、残りは手数が散るように取る
const rare=ok.filter(l=>l.type&&l.type!=='思考');
const rest=ok.filter(l=>!rare.includes(l)).sort((a,b)=>a.p-b.p);
const pick=rare.slice(0, WANT);
const need=WANT-pick.length;
if(need>0){
  for(let i=0;i<need;i++) pick.push(rest[Math.round(i*(rest.length-1)/Math.max(1,need-1))]);
}
const chosen=[...new Set(pick)].filter(Boolean).slice(0, WANT);
console.log(`選んだ${chosen.length}面: ` + Object.entries(chosen.reduce((m,l)=>{m[l.type||'-']=(m[l.type||'-']||0)+1;return m;},{})).map(([k,v])=>k+' '+v).join(' / '));

chosen.forEach(l=>data.levels.push(l));

// 指定の面から末尾までを手数順に並べ直す
const head=data.levels.slice(0, FROM-1);
const tail=data.levels.slice(FROM-1).sort((a,b)=>a.p-b.p||a.carry-b.carry);
data.levels=head.concat(tail);
data.levels.forEach((l,i)=>{ l.orig=i+1; });
data.count=data.levels.length;
fs.writeFileSync(TARGET, JSON.stringify(data));

console.log(`\n第${FROM}面〜第${data.count}面を手数順に並べ直しました (全${data.count}面)`);
const at=id=>data.levels.findIndex(l=>l.id===id)+1;
console.log('\n 面   手数 荷物  盤    経路  囮  順番  型');
chosen.slice().sort((a,b)=>at(a.id)-at(b.id)).forEach(l=>{
  const r=l.b.split('/');
  console.log(String(at(l.id)).padStart(4)+String(l.p).padStart(6)+String(l.nbox||'-').padStart(4)
    +((r[0].length-2)+'x'+(r.length-2)).padStart(8)+String(l.mano).padStart(6)
    +String(l.dec).padStart(6)+String(l.acc).padStart(6)+'  '+(l.type||''));
});
