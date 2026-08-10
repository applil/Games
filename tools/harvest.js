'use strict';
/* 1枚の盤から、難しい面をまとめて採るための共通処理。
 *
 * これまでは候補1つごとに solvableStates を呼び直していた。
 * 盤と置き場が同じなら結果も同じなので、盤あたり1回にまとめる。
 *   - 全局面表          … 盤ごとに1回
 *   - 置き場までの押し距離 … 置き場ごとに1回
 * 候補ごとにやるのは、最短手順の枝をたどる分だけ。
 * これで「1回数え上げて1面」から「1回数え上げて何十面」に変わる。
 */
const path=require('path');
const E=require(path.join(__dirname,'..','warehouse','engine.js')).WarehouseEngine;
const {solvableStates, regionRep, keyOf, pushesFrom}=E;

// ある置き場まで、荷物をまっすぐ押していくのに要る手数を全マスぶん出す(置き場から逆にたどる)
function goalDist(grid, w, goal){
  const d=new Int32Array(grid.length).fill(-1);
  d[goal]=0;
  const q=[goal];
  for(let i=0;i<q.length;i++){
    const c=q[i];
    for(const dd of [1,-1,w,-w]){
      const from=c-dd;                       // from を dd 方向へ押すと c に来る
      if(grid[from]||d[from]>=0) continue;
      if(grid[from-dd]) continue;            // 押す側に立てない
      d[from]=d[c]+1; q.push(from);
    }
  }
  return d;
}

const permutations=a=>a.length<=1 ? [a]
  : a.flatMap((x,i)=>permutations(a.slice(0,i).concat(a.slice(i+1))).map(r=>[x,...r]));

// 荷物を割り当てて、まっすぐ押すだけなら何手か(表を使い回すので速い)
function carryCost(gd, boxes, goals){
  const perms=permutations(goals.map((_,i)=>i));
  let best=Infinity;
  for(const idx of perms){
    let s=0, ok=true;
    for(let i=0;i<boxes.length;i++){ const v=gd[idx[i]][boxes[i]]; if(v<0){ ok=false; break; } s+=v; }
    if(ok&&s<best) best=s;
  }
  return isFinite(best)?best:null;
}

// 囮の数え上げ。全局面表と押し距離表を渡すので、ここでは数え直さない
function decoyFrom(grid, w, goals, table, gd, boxes0, rep0){
  const start=boxes0.slice().sort((a,b)=>a-b);
  const reg=regionRep(grid,w,new Set(start),rep0);
  const k0=keyOf(start, reg.rep);
  if(!table.has(k0)) return null;
  const goalIdx=new Map(goals.map((g,i)=>[g,i]));
  const near=(c, filled)=>{
    let b=Infinity;
    for(let i=0;i<goals.length;i++){ if(filled[i]) continue; const v=gd[i][c]; if(v>=0&&v<b) b=v; }
    return b;
  };
  const seen=new Map([[k0,{boxes:start, cells:reg.cells}]]);
  const q=[k0];
  let states=0, looks=0, decoys=0, corrects=0, lethal=0;
  while(q.length){
    const k=q.shift(), s=seen.get(k), d=table.get(k);
    if(d===0) continue;
    states++;
    const filled=new Array(goals.length).fill(false);
    for(const c of s.boxes){ const gi=goalIdx.get(c); if(gi!==undefined) filled[gi]=true; }
    for(const m of pushesFrom(grid,w,s.boxes,s.cells)){
      const moved=m.boxes.find(c=>!s.boxes.includes(c));
      const from =s.boxes.find(c=>!m.boxes.includes(c));
      if(moved===undefined||from===undefined) continue;
      const fi=goalIdx.get(from);
      const saved = fi!==undefined && filled[fi];
      if(saved) filled[fi]=false;
      const looksGood = near(moved,filled) < near(from,filled);
      if(saved) filled[fi]=true;
      const ok = table.has(m.key) && table.get(m.key)===d-1;
      if(looksGood) looks++;
      if(ok) corrects++;
      if(looksGood&&!ok){ decoys++; if(!table.has(m.key)) lethal++; }
      if(!ok||seen.has(m.key)) continue;
      seen.set(m.key,{boxes:m.boxes.slice().sort((a,b)=>a-b), cells:m.cells});
      q.push(m.key);
    }
  }
  return {states, looks, corrects, decoys, lethal,
    share: looks? +(decoys/looks).toFixed(2) : 0,
    perState: states? +(decoys/states).toFixed(2) : 0,
    // 最短を保つ手が1本しかない局面の割合。高いほど一本道で、長くても簡単
    forced: states? +(1 - (corrects-states)/Math.max(1,states)).toFixed(2) : 1};
}

// 最短経路上で「指す手が1本しかない」局面の割合。第499・500面が簡単だった理由がこれ
function forcedShare(grid, w, table, boxes0, rep0){
  const start=boxes0.slice().sort((a,b)=>a-b);
  const reg=regionRep(grid,w,new Set(start),rep0);
  const k0=keyOf(start, reg.rep);
  if(!table.has(k0)) return null;
  const seen=new Map([[k0,{boxes:start, cells:reg.cells}]]);
  const q=[k0]; let n=0, only=0, opts=0;
  while(q.length){
    const k=q.shift(), s=seen.get(k), d=table.get(k);
    if(d===0) continue;
    let o=0;
    for(const m of pushesFrom(grid,w,s.boxes,s.cells)){
      if(!table.has(m.key)||table.get(m.key)!==d-1) continue;
      o++;
      if(seen.has(m.key)) continue;
      seen.set(m.key,{boxes:m.boxes.slice().sort((a,b)=>a-b), cells:m.cells});
      q.push(m.key);
    }
    n++; opts+=o; if(o===1) only++;
  }
  return {pathStates:n, optPerState:+(opts/n).toFixed(2), forced:+(only/n).toFixed(2)};
}

module.exports={goalDist, carryCost, decoyFrom, forcedShare, solvableStates};
