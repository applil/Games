'use strict';
/* 「惑わされる度合い」を測る。
 *
 * 各局面で出せる押し手を3つに分ける:
 *   進捗して見える … その荷物が、まだ埋まっていない置き場に近づく押し手
 *   正解         … 最短手数を保つ押し手
 *   囮           … 進捗して見えるのに、最短を外す押し手
 * 囮が多いほど、盤を見ただけでは手が決まらない = 頭を使う。
 * 使われない床を減点する測り方と違い、囮として働く床はむしろ加点になる。
 */
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const X=require(path.join(__dirname,'xsb.js'));
const M=require(path.join(__dirname,'manoeuvre.js'));

function decoy(board){
  const p=X.fromXSB(board.split('/'));
  const table=E.solvableStates(p.grid,p.w,p.goals,3000000);
  if(!table) return null;
  const reg=E.regionRep(p.grid,p.w,new Set(p.boxes),p.player);
  const k0=E.keyOf(p.boxes.slice().sort((a,b)=>a-b), reg.rep);
  if(!table.has(k0)) return null;

  // 各マスから各置き場までの、まっすぐ押したときの距離(先に全部引いておく)
  const dist={};
  for(const g of p.goals) dist[g]=(()=>{ const m={}; for(let i=0;i<p.grid.length;i++){
      if(p.grid[i]) continue; const d=M.pushDist(p.grid,p.w,i,g); if(d>=0) m[i]=d; } return m; })();
  const near=(c, filled)=>{
    let b=Infinity;
    for(const g of p.goals){ if(filled.has(g)) continue; const d=dist[g][c]; if(d!==undefined&&d<b) b=d; }
    return b;
  };

  const seen=new Map([[k0,{boxes:p.boxes.slice().sort((a,b)=>a-b), cells:reg.cells}]]);
  const q=[k0];
  let states=0, decoys=0, corrects=0, looks=0, lethal=0;
  while(q.length){
    const k=q.shift(), s=seen.get(k), d=table.get(k);
    if(d===0) continue;
    const filled=new Set(s.boxes.filter(c=>p.goals.includes(c)));
    states++;
    for(const m of E.pushesFrom(p.grid,p.w,s.boxes,s.cells)){
      const moved=m.boxes.find(c=>!s.boxes.includes(c));
      const from =s.boxes.find(c=>!m.boxes.includes(c));
      if(moved===undefined||from===undefined) continue;
      const f2=new Set([...filled]); f2.delete(from);
      const looksGood = near(moved,f2) < near(from,f2);
      const ok = table.has(m.key) && table.get(m.key)===d-1;
      if(looksGood) looks++;
      if(ok) corrects++;
      if(looksGood && !ok){ decoys++; if(!table.has(m.key)) lethal++; }
      if(!ok || seen.has(m.key)) continue;
      seen.set(m.key,{boxes:m.boxes.slice().sort((a,b)=>a-b), cells:m.cells});
      q.push(m.key);
    }
  }
  return {states, looks, corrects, decoys, lethal,
    perState:+(decoys/Math.max(1,states)).toFixed(2),        // 1局面あたりの囮の本数
    share:+(decoys/Math.max(1,looks)).toFixed(2)};           // 進捗して見える手のうち囮の割合
}
module.exports={decoy};
